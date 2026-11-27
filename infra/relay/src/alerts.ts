import { boundedLifetime, signJwt, verifyJwt } from "@runnerbox/connect/jwt";
import { CONNECT_TYP, environmentAudience, NotifyProofPayload, SignedRequest } from "@runnerbox/contracts";
import * as Schema from "effect/Schema";
import { decodeJwt } from "jose";
import { json, Refusal } from "./http.ts";
import { seal, unseal } from "./sealed.ts";
import type { createStore } from "./store.ts";

// Alerts sent beyond the app, for a user signed in to their RunnerBox account. Slack first: one
// Slack app, owned by whoever runs the relay, installs to a channel the user picks; the relay keeps
// that channel's webhook sealed, and a linked environment asks the relay to post to it. No
// environment ever holds a Slack secret.

export type SlackConfig = {
  clientId: string;
  clientSecret: string;
  // Checks that events, such as an uninstall, came from Slack.
  signingSecret: string;
  // 32 bytes in base64, sealing webhooks and tokens at rest.
  sealingKey: string;
};

type Deps = {
  slack: SlackConfig | undefined;
  store: ReturnType<typeof createStore>;
  issuer: string;
  signingPrivateKey: string;
  signingPublicKey: string;
  userOf: (request: Request) => Promise<string>;
  now: () => number;
  fetch: typeof fetch;
};

const STATE_TYP = "rbx-relay-slack-state+jwt";
const STATE_SECONDS = 600;
const SLACK_API = "https://slack.com/api";
const WEBHOOK_PREFIX = "https://hooks.slack.com/";
// Per user: at most this many alerts an hour, and the same alert once in ten minutes.
export const HOURLY_ALERTS = 30;
const REPEAT_MS = 10 * 60_000;
const SIGNATURE_WINDOW_SECONDS = 300;

const decodeSigned = Schema.decodeUnknownSync(SignedRequest);
const decodeNotify = Schema.decodeUnknownSync(NotifyProofPayload);
const OAuthAnswer = Schema.Struct({
  ok: Schema.Literal(true),
  access_token: Schema.String,
  team: Schema.Struct({ id: Schema.String, name: Schema.String }),
  incoming_webhook: Schema.Struct({ url: Schema.String, channel: Schema.String }),
});
const decodeOAuth = Schema.decodeUnknownOption(OAuthAnswer);
const SlackEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("url_verification"), challenge: Schema.String }),
  Schema.Struct({ type: Schema.Literal("event_callback"), team_id: Schema.String, event: Schema.Struct({ type: Schema.String }) }),
]);
const decodeEvent = Schema.decodeUnknownOption(Schema.fromJsonString(SlackEvent));

const hex = (data: ArrayBuffer) => [...new Uint8Array(data)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

// Slack's own escaping, so nothing an environment sends can mention, link or format.
export const slackText = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><body style="font:15px system-ui;background:#141414;color:#f5f5f5;padding:48px 24px"><h1 style="font-size:20px">${html(title)}</h1><p>${html(body)}</p></body>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });

export function alertRoutes(deps: Deps): Record<string, (request: Request) => Promise<Response>> {
  const { store, issuer, now } = deps;
  const seconds = () => Math.floor(now() / 1000);
  const redirectUri = `${issuer}/v1/alerts/slack/callback`;
  const slack = () => {
    if (!deps.slack) throw new Refusal(404, "slack_not_configured");
    return deps.slack;
  };
  const revoke = async (config: SlackConfig, sealedToken: string) => {
    const token = await unseal(config.sealingKey, sealedToken).catch(() => null);
    if (token) await deps.fetch(`${SLACK_API}/auth.revoke`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
  };

  return {
    "GET /v1/alerts/destinations": async (request) => {
      const userId = await deps.userOf(request);
      const row = await store.slackDestination(userId);
      return json({ slack: row ? { team: row.team_name, channel: row.channel, connectedAt: row.connected_at } : null });
    },

    // The address of Slack's install screen, with a state only this user's callback can spend.
    "POST /v1/alerts/slack/connect": async (request) => {
      const config = slack();
      const userId = await deps.userOf(request);
      const state = await signJwt({ privateKey: deps.signingPrivateKey, typ: STATE_TYP, payload: { iss: issuer, aud: issuer, sub: userId, jti: crypto.randomUUID(), iat: seconds(), exp: seconds() + STATE_SECONDS } });
      const url = new URL("https://slack.com/oauth/v2/authorize");
      url.search = new URLSearchParams({ client_id: config.clientId, scope: "incoming-webhook", redirect_uri: redirectUri, state }).toString();
      return json({ url: url.toString() });
    },

    // Where Slack sends the browser back. The state names the user and is spent once.
    "GET /v1/alerts/slack/callback": async (request) => {
      const config = slack();
      const query = new URL(request.url).searchParams;
      if (query.get("error")) return page("Slack wasn't connected", "The install was cancelled. You can close this tab and try again from RunnerBox.");
      const state = await verifyJwt({ publicKey: deps.signingPublicKey, token: query.get("state") ?? "", typ: STATE_TYP, issuer, audience: issuer, now: now() }).catch(() => null);
      if (!state || typeof state.sub !== "string" || typeof state.jti !== "string" || typeof state.exp !== "number" || !(await store.consumeOnce(`slack-state:${state.jti}`, state.exp * 1000))) {
        return page("Slack wasn't connected", "This link has expired or was already used. Start again from RunnerBox.", 400);
      }
      const answer = await deps
        .fetch(`${SLACK_API}/oauth.v2.access`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code: query.get("code") ?? "", redirect_uri: redirectUri }).toString(),
        })
        .then((response) => response.json())
        .then(decodeOAuth)
        .catch(() => null);
      if (!answer || answer._tag === "None" || !answer.value.incoming_webhook.url.startsWith(WEBHOOK_PREFIX)) return page("Slack wasn't connected", "Slack didn't finish the install. Try again from RunnerBox.", 502);
      const installed = answer.value;
      const previous = await store.slackDestination(state.sub);
      if (previous) await revoke(config, previous.token_encrypted);
      await store.putSlackDestination({
        user_id: state.sub,
        team_id: installed.team.id,
        team_name: installed.team.name,
        channel: installed.incoming_webhook.channel,
        webhook_encrypted: await seal(config.sealingKey, installed.incoming_webhook.url),
        token_encrypted: await seal(config.sealingKey, installed.access_token),
        connected_at: new Date(now()).toISOString(),
      });
      return page("Slack is connected", `RunnerBox alerts go to ${installed.incoming_webhook.channel} in ${installed.team.name}. You can close this tab.`);
    },

    "DELETE /v1/alerts/slack": async (request) => {
      const config = slack();
      const userId = await deps.userOf(request);
      const row = await store.slackDestination(userId);
      if (row) {
        await store.deleteSlackDestination(userId);
        await revoke(config, row.token_encrypted);
      }
      return json({ ok: true });
    },

    // Slack telling the relay the app was removed, signed with the app's signing secret.
    "POST /v1/alerts/slack/events": async (request) => {
      const config = slack();
      const raw = await request.text();
      const stamp = request.headers.get("x-slack-request-timestamp") ?? "";
      if (!/^\d+$/.test(stamp) || Math.abs(seconds() - Number(stamp)) > SIGNATURE_WINDOW_SECONDS) throw new Refusal(401, "signature_invalid");
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const signature = /^v0=([0-9a-f]{64})$/.exec(request.headers.get("x-slack-signature") ?? "")?.[1];
      const given = signature ? Uint8Array.from(signature.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)) : null;
      if (!given || !(await crypto.subtle.verify("HMAC", key, given, new TextEncoder().encode(`v0:${stamp}:${raw}`)))) throw new Refusal(401, "signature_invalid");
      const event = decodeEvent(raw);
      if (event._tag === "None") return json({ ok: true });
      if (event.value.type === "url_verification") return json({ challenge: event.value.challenge });
      if (event.value.event.type === "app_uninstalled" || event.value.event.type === "tokens_revoked") {
        for (const row of await store.slackDestinationsForTeam(event.value.team_id)) await store.deleteSlackDestination(row.user_id);
      }
      return json({ ok: true });
    },

    // A linked environment asking to tell its user something, signed with its pinned key.
    "POST /v1/alerts/notify": async (request) => {
      const { proof } = decodeSigned(await request.json().catch(() => null));
      let claimed: NotifyProofPayload;
      try {
        claimed = decodeNotify(decodeJwt(proof));
      } catch {
        throw new Refusal(400, "notify_proof_invalid");
      }
      const link = await store.link({ userId: claimed.cloudUserId, environmentId: claimed.environmentId });
      const verified = link
        ? await verifyJwt({ publicKey: link.environment_public_key, token: proof, typ: CONNECT_TYP.notify, issuer: environmentAudience(claimed.environmentId), audience: issuer, now: now() }).catch(() => null)
        : null;
      if (!link || !verified || claimed.sub !== claimed.environmentId || !boundedLifetime(claimed, now())) throw new Refusal(403, "notify_proof_invalid");
      if (!(await store.consumeOnce(`notify:${claimed.environmentId}:${claimed.jti}`, claimed.exp * 1000))) throw new Refusal(400, "replayed");
      const userId = claimed.cloudUserId;
      const row = deps.slack ? await store.slackDestination(userId) : null;
      if (!deps.slack || !row) return json({ sent: false, reason: "no_destination" });
      if (!(await store.consumeOnce(`alert:${userId}:${await sha256(claimed.alert.title)}`, now() + REPEAT_MS))) return json({ sent: false, reason: "repeat" });
      const within = await store.countAlert(userId, HOURLY_ALERTS);
      // Past the limit, one message says so and the rest of the hour's alerts stay in the app.
      const over = !within && (await store.consumeOnce(`alert-limit:${userId}:${Math.floor(now() / 3_600_000)}`, now() + 3_600_000));
      if (!within && !over) return json({ sent: false, reason: "limited" });
      const text = over ? `*RunnerBox*: more alerts than ${HOURLY_ALERTS} this hour. The rest are in RunnerBox.` : `*RunnerBox* · ${slackText(link.label)}: ${slackText(claimed.alert.title)}`;
      const webhook = await unseal(deps.slack.sealingKey, row.webhook_encrypted);
      const sent = await deps.fetch(webhook, { method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }) }).catch(() => null);
      // Slack answers 404 or 410 once the channel or the install is gone.
      if (sent && (sent.status === 404 || sent.status === 410)) await store.deleteSlackDestination(userId);
      return json({ sent: sent?.ok === true });
    },
  };
}
