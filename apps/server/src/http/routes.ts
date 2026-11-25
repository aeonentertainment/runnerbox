import { DESCRIPTOR_PATH, PairRequest, SERVER_PROOF_NONCE } from "@runnerbox/contracts";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as AuthStore from "../auth/AuthStore.ts";
import * as EnvironmentIdentity from "../environment/EnvironmentIdentity.ts";
import * as ReviewBot from "../github/ReviewBot.ts";
import { bearerToken } from "./bearer.ts";
import { dpopThumbprint } from "./dpop.ts";

const noStore = { "cache-control": "no-store" };
const fail = (status: number, error: string) => HttpServerResponse.jsonUnsafe({ error }, { status, headers: noStore });

// Public: who this is. With a client's nonce it also proves it holds the environment's key, so
// the client can check that before sending any credential.
const descriptor = HttpRouter.add(
  "GET",
  DESCRIPTOR_PATH,
  Effect.gen(function* () {
    const { descriptor, proveTo } = yield* EnvironmentIdentity.EnvironmentIdentity;
    const nonce = Option.getOrUndefined(HttpServerRequest.toURL(yield* HttpServerRequest.HttpServerRequest))?.searchParams.get("nonce");
    if (nonce === undefined || nonce === null) return HttpServerResponse.jsonUnsafe(descriptor, { headers: noStore });
    if (!SERVER_PROOF_NONCE.test(nonce)) return fail(400, "invalid_nonce");
    return HttpServerResponse.jsonUnsafe({ ...descriptor, proof: proveTo(nonce) }, { headers: noStore });
  }),
);

// Trades a one-time pairing code for a client session token. Through the tunnel, only a code
// bound to the requester's key is accepted.
const pair = (entry: AuthStore.Entry) => HttpRouter.add(
  "POST",
  "/api/auth/pair",
  Effect.gen(function* () {
    const store = yield* AuthStore.AuthStore;
    const { descriptor } = yield* EnvironmentIdentity.EnvironmentIdentity;
    const input = yield* HttpServerRequest.schemaBodyJson(PairRequest);
    // A Connect credential is bound to the client's key; the proof shows the client holds it.
    const proofKeyThumbprint = yield* dpopThumbprint(yield* HttpServerRequest.HttpServerRequest);
    if (proofKeyThumbprint === "invalid") return fail(401, "invalid_proof");
    const { token, session } = yield* store.pair({ ...input, proofKeyThumbprint, keyBoundOnly: entry === "tunnel" });
    return HttpServerResponse.jsonUnsafe(
      { environmentId: descriptor.environmentId, token, scopes: session.scopes },
      { headers: noStore },
    );
  }).pipe(
    Effect.catchTags({
      PairingRejected: () => Effect.succeed(fail(401, "pairing_rejected")),
      SchemaError: () => Effect.succeed(fail(400, "invalid_request")),
      HttpServerError: () => Effect.succeed(fail(400, "invalid_request")),
    }),
  ),
);

// A browser can't set headers on a WebSocket, so the client trades its token for a ticket that
// goes in the socket URL. It lasts seconds and opens one socket, so the token stays out of URLs.
const wsTicket = (entry: AuthStore.Entry) => HttpRouter.add(
  "POST",
  "/api/auth/ws-ticket",
  Effect.gen(function* () {
    const store = yield* AuthStore.AuthStore;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const token = bearerToken(request);
    const proofKeyThumbprint = yield* dpopThumbprint(request);
    if (proofKeyThumbprint === "invalid") return fail(401, "invalid_proof");
    const session = token === undefined ? undefined : yield* store.authenticate(token, "client", proofKeyThumbprint);
    // Through the tunnel, only sessions bought with a Connect credential work.
    if (!session || (entry === "tunnel" && session.proofKeyThumbprint === undefined)) return fail(401, "invalid_credential");
    return HttpServerResponse.jsonUnsafe(yield* store.issueTicket(session, entry), { headers: noStore });
  }),
);

// A plain page for the owner's browser. `after` is markup the caller built and escaped itself.
const page = (status: number, title: string, line: string, after = "") =>
  HttpServerResponse.text(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#141414;color:#f5f5f5;padding:48px"><h1 style="font-size:20px">${title}</h1><p>${line}</p>${after}`, { status, contentType: "text/html; charset=utf-8", headers: noStore });

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

// Where the owner's browser starts creating the review bot: GitHub takes an App's manifest only as
// a posted form, so this page holds it, with one button that sends it to GitHub. It's shown only to
// whoever has the setup's state, which the session that started the setup was given.
const botSetup = HttpRouter.add(
  "GET",
  ReviewBot.SETUP_PATH,
  Effect.gen(function* () {
    const bot = yield* ReviewBot.ReviewBot;
    const state = Option.getOrUndefined(HttpServerRequest.toURL(yield* HttpServerRequest.HttpServerRequest))?.searchParams.get("state") ?? "";
    const form = yield* bot.setupForm(state);
    if (form === null) return page(400, "That link doesn't start a review bot", "It was already used or it ran out. Start again from Settings.");
    return page(
      200,
      "Create the review bot on GitHub",
      "GitHub will show the bot's name and what it may do before anything is created. It asks to write to pull requests and nothing else.",
      `<form method="post" action="${escapeHtml(form.action)}"><input type="hidden" name="manifest" value="${escapeHtml(form.manifest)}"><button style="font:inherit;padding:8px 14px;border-radius:8px;border:0;background:#346bf1;color:#fff;cursor:pointer">Continue to GitHub</button></form>`,
    );
  }),
);

// Where GitHub sends the owner's browser once the review bot's App exists, with a one-time code.
// No session comes with a redirect, so the setup's own state is what's checked: only the setup an
// authorized session started is finished, once. The page says what happened and nothing else.
const botCreated = HttpRouter.add(
  "GET",
  ReviewBot.CREATED_PATH,
  Effect.gen(function* () {
    const bot = yield* ReviewBot.ReviewBot;
    const query = Option.getOrUndefined(HttpServerRequest.toURL(yield* HttpServerRequest.HttpServerRequest))?.searchParams;
    const outcome = yield* bot.finishSetup(query?.get("code") ?? "", query?.get("state") ?? "");
    if (outcome === "unreachable") return page(502, "GitHub didn't answer", "The review bot isn't saved yet. Reload this page to try again.");
    return outcome === "created"
      ? page(200, "Review bot created", "Go back to runnerbox to pick the repositories it may comment on.")
      : page(400, "That link didn't create a review bot", "It was already used, it ran out, or it wasn't started from runnerbox. Start again from Settings.");
  }).pipe(Effect.catchTag("ReviewBotError", () => Effect.succeed(page(500, "Couldn't save the review bot", "The server couldn't write to its own folder. Check it and start again from Settings.")))),
);

// Credentials are bearer tokens, never cookies, so any origin may call these: a page in the
// user's browser has nothing it could ride on.
const cors = HttpRouter.cors({ allowedHeaders: ["authorization", "content-type", "dpop"], maxAge: 600 });

// The bot's setup page and redirect are answered only on the listener apps use, never the tunnel's.
export const layer = (entry: AuthStore.Entry) => Layer.mergeAll(descriptor, pair(entry), wsTicket(entry), cors, ...(entry === "local" ? [botSetup, botCreated] : []));
