import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSigningKeyPair, signJwt } from "@runnerbox/connect/jwt";
import { CONNECT_TYP, environmentAudience } from "@runnerbox/contracts";
import { HOURLY_ALERTS } from "./alerts.ts";
import { createRelay } from "./relay.ts";
import { createStore } from "./store.ts";
import { fakeIdentity, fakeTunnels } from "./testing/fakes.ts";
import { sqliteD1 } from "./testing/sqliteD1.ts";

const ISSUER = "https://relay.example.com";
const SIGNING_SECRET = "slack-signing-secret";
const sealingKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

async function setUp(slack = true) {
  const keys = await generateSigningKeyPair();
  const environment = await generateSigningKeyPair();
  const db = sqliteD1();
  const store = createStore(db, Date.now);
  // Slack, as a record of what was asked: the install trades a code, the webhook takes posts.
  const slackCalls: Array<{ url: string; body: string; auth: string | null }> = [];
  const relay = createRelay({
    config: { issuer: ISSUER, signingPrivateKey: keys.privateKey, signingPublicKey: keys.publicKey, clerkFrontendApi: "clerk.example.com", cliClientId: "cli", desktopClientId: "desktop", tunnelBaseDomain: "connect.example.com", requireHttps: false, cleanupMode: "off" },
    slack: slack ? { clientId: "client", clientSecret: "secret", signingSecret: SIGNING_SECRET, sealingKey } : undefined,
    store,
    identity: fakeIdentity({ "token-alice": "user_alice" }),
    tunnels: fakeTunnels(() => "http://127.0.0.1:1").provider,
    now: Date.now,
    fetch: async (input, init) => {
      const url = String(input);
      slackCalls.push({ url, body: typeof init?.body === "string" ? init.body : "", auth: new Headers(init?.headers).get("authorization") });
      if (url.endsWith("/oauth.v2.access")) return Response.json({ ok: true, access_token: "xoxb-token", team: { id: "T1", name: "Example" }, incoming_webhook: { url: "https://hooks.slack.com/services/T1/B1/secret", channel: "#ci" } });
      return new Response("ok");
    },
  });
  await store.claimLink({ user_id: "user_alice", environment_id: "env1", label: "mac <b>", environment_public_key: environment.publicKey, http_base_url: "https://rbx.example.com" });
  const call = (method: string, path: string, init: RequestInit = {}) => relay.fetch(new Request(`${ISSUER}${path}`, { method, ...init }));
  const signed = (title: string, privateKey = environment.privateKey) => {
    const at = Math.floor(Date.now() / 1000);
    return signJwt({ privateKey, typ: CONNECT_TYP.notify, payload: { iss: environmentAudience("env1"), aud: ISSUER, sub: "env1", jti: crypto.randomUUID(), iat: at, exp: at + 60, environmentId: "env1", cloudUserId: "user_alice", alert: { kind: "job_failed", title } } });
  };
  const notify = async (proof: string) => {
    const response = await call("POST", "/v1/alerts/notify", { body: JSON.stringify({ proof }), headers: { "content-type": "application/json" } });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { db, relay, call, signed, notify, slackCalls, keys };
}

const alice = { authorization: "Bearer token-alice" };

test("a user connects Slack once per install link, and the webhook is kept sealed", async () => {
  const { call, db, slackCalls } = await setUp();
  const { url } = (await (await call("POST", "/v1/alerts/slack/connect", { headers: alice })).json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  assert.deepEqual([new URL(url).searchParams.get("scope"), new URL(url).searchParams.get("redirect_uri")], ["incoming-webhook", `${ISSUER}/v1/alerts/slack/callback`]);
  const back = await call("GET", `/v1/alerts/slack/callback?code=c1&state=${encodeURIComponent(state)}`);
  assert.equal(back.status, 200);
  assert.match(await back.text(), /go to #ci in Example/);
  assert.equal((await call("GET", `/v1/alerts/slack/callback?code=c1&state=${encodeURIComponent(state)}`)).status, 400);
  const row = await db.prepare("SELECT * FROM slack_destinations").first<{ webhook_encrypted: string; token_encrypted: string }>();
  assert.ok(row && !row.webhook_encrypted.includes("hooks.slack.com") && !row.token_encrypted.includes("xoxb"));
  assert.deepEqual(await (await call("GET", "/v1/alerts/destinations", { headers: alice })).json().then((body) => (body as { slack: { channel: string } }).slack.channel), "#ci");
  assert.equal(slackCalls.filter((each) => each.url.endsWith("/oauth.v2.access")).length, 1);
  assert.equal((await call("GET", "/v1/alerts/destinations")).status, 401);
});

test("a linked environment's alert is posted escaped, once per ten minutes, within the hour's limit, and only with its own key", async () => {
  const { call, signed, notify, slackCalls, keys } = await setUp();
  assert.deepEqual((await notify(await signed("before Slack"))).body, { sent: false, reason: "no_destination" });
  const { url } = (await (await call("POST", "/v1/alerts/slack/connect", { headers: alice })).json()) as { url: string };
  await call("GET", `/v1/alerts/slack/callback?code=c1&state=${encodeURIComponent(new URL(url).searchParams.get("state") ?? "")}`);

  const proof = await signed("ci <!channel> failed & <https://evil.example|click>");
  assert.deepEqual((await notify(proof)).body, { sent: true });
  const posted = slackCalls.filter((each) => each.url.startsWith("https://hooks.slack.com/"));
  assert.deepEqual(JSON.parse(posted[0]?.body ?? "{}"), { text: "*RunnerBox* · mac &lt;b&gt;: ci &lt;!channel&gt; failed &amp; &lt;https://evil.example|click&gt;", unfurl_links: false, unfurl_media: false });
  assert.equal((await notify(proof)).status, 400);
  assert.deepEqual((await notify(await signed("ci <!channel> failed & <https://evil.example|click>"))).body, { sent: false, reason: "repeat" });
  assert.equal((await notify(await signed("forged", keys.privateKey))).status, 403);

  for (let index = 1; index < HOURLY_ALERTS; index++) await notify(await signed(`alert ${index}`));
  assert.deepEqual((await notify(await signed("over the limit"))).body, { sent: true });
  assert.match(JSON.parse(slackCalls.at(-1)?.body ?? "{}").text, /more alerts than 30 this hour/);
  assert.deepEqual((await notify(await signed("still over"))).body, { sent: false, reason: "limited" });
});

test("Slack's signed uninstall removes the destination, a forged one doesn't, and disconnecting revokes the token", async () => {
  const { call, db, slackCalls } = await setUp();
  const connect = async () => {
    const { url } = (await (await call("POST", "/v1/alerts/slack/connect", { headers: alice })).json()) as { url: string };
    await call("GET", `/v1/alerts/slack/callback?code=c1&state=${encodeURIComponent(new URL(url).searchParams.get("state") ?? "")}`);
  };
  await connect();
  const event = JSON.stringify({ type: "event_callback", team_id: "T1", event: { type: "app_uninstalled" } });
  const stamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${stamp}:${event}`)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const send = (sig: string) => call("POST", "/v1/alerts/slack/events", { body: event, headers: { "x-slack-request-timestamp": stamp, "x-slack-signature": `v0=${sig}` } });
  assert.equal((await send("0".repeat(64))).status, 401);
  assert.ok(await db.prepare("SELECT 1 FROM slack_destinations").first());
  assert.equal((await send(signature)).status, 200);
  assert.equal(await db.prepare("SELECT 1 FROM slack_destinations").first(), null);

  await connect();
  assert.equal((await call("DELETE", "/v1/alerts/slack", { headers: alice })).status, 200);
  assert.equal(await db.prepare("SELECT 1 FROM slack_destinations").first(), null);
  assert.deepEqual(slackCalls.filter((each) => each.url.endsWith("/auth.revoke")).map((each) => each.auth), ["Bearer xoxb-token"]);
});

test("a relay without a Slack app says so", async () => {
  const { call } = await setUp(false);
  assert.equal((await call("POST", "/v1/alerts/slack/connect", { headers: alice })).status, 404);
});
