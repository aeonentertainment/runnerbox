import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { type ReviewBot as ReviewBotView, ReviewBotError, type ReviewBotSetup } from "@runnerbox/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { writeFileAtomic } from "../config/atomicWrite.ts";
import * as ServerPaths from "../config/ServerPaths.ts";
import { QueueConfig } from "../runners/QueueConfig.ts";

// The review bot: a GitHub App the owner creates for this server through GitHub's manifest flow, so
// a review is posted under a bot's name. The owner's browser posts a manifest to GitHub, confirms
// there, and GitHub sends the browser back here with a one-time code, which the server trades for
// the App's private key. The key is kept in `.server/review-bot.json`, owner-only. It's never
// returned over RPC, logged, given to an agent or put in a thread, and is used only to sign
// requests to GitHub. The App asks for one permission, writing to pull requests, and no webhook.

const GITHUB = "https://github.com";
const TIMEOUT_MS = 15_000;
// GitHub gives an hour to finish the flow; a setup nobody finished is forgotten then.
const SETUP_MS = 60 * 60_000;
const HOMEPAGE = "https://runnerbox.dev";

// Where GitHub may send the browser back: this machine's loopback only, so the code that buys the
// key can't be sent to another host.
const LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;
// GitHub's own limits on an account name.
const ORGANIZATION = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const CODE = /^[A-Za-z0-9_-]{1,200}$/;
export const CREATED_PATH = "/api/github/bot-created";

const Stored = Schema.Struct({
  v: Schema.Literal(1),
  appId: Schema.Int,
  clientId: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  privateKey: Schema.String,
  createdAt: Schema.String,
});
type Stored = typeof Stored.Type;
const decodeFile = Schema.decodeUnknownEffect(Schema.fromJsonString(Stored));
// What GitHub answers when a manifest's code is traded in. Its client secret and webhook secret
// aren't read: nothing here uses them, so they're never held.
const decodeConversion = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.Int, client_id: Schema.String, slug: Schema.String, name: Schema.String, pem: Schema.String }));

type Pending = { readonly state: string; readonly expiresAt: number };

export class ReviewBot extends Context.Service<
  ReviewBot,
  {
    readonly status: Effect.Effect<ReviewBotView | null, ReviewBotError>;
    // Starts a setup and says what the browser posts to GitHub. A setup already waiting is dropped.
    readonly startSetup: (redirectBase: string, organization: string | undefined) => Effect.Effect<ReviewBotSetup, ReviewBotError>;
    // GitHub sent the browser back with `code`. Only the setup that was started, named by `state`,
    // is finished, and only once.
    readonly finishSetup: (code: string, state: string) => Effect.Effect<"created" | "refused", ReviewBotError>;
    // Forgets the key. The App stays on GitHub until the owner deletes it there.
    readonly remove: Effect.Effect<void, ReviewBotError>;
  }
>()("runnerbox/server/github/ReviewBot") {}

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { serverDir } = yield* ServerPaths.ServerPaths;
  const config = yield* QueueConfig;
  const site = config.loginBase ?? GITHUB;
  const path = join(serverDir, "review-bot.json");
  const unreadable = () => new ReviewBotError({ reason: "unreadable" });
  // One change at a time, so two redirects can't both spend a setup.
  const lock = yield* Semaphore.make(1);
  let stored: Stored | null | undefined;
  let pending: Pending | null = null;

  const current = Effect.suspend(() =>
    stored !== undefined
      ? Effect.succeed(stored)
      : fs.readFileString(path).pipe(
          Effect.map(Option.some),
          Effect.catchTag("PlatformError", (error) => (error.reason._tag === "NotFound" ? Effect.succeed(Option.none<string>()) : Effect.fail(error))),
          Effect.flatMap((text) => (Option.isSome(text) ? decodeFile(text.value) : Effect.succeed(null))),
          Effect.mapError(unreadable),
          Effect.tap((read) => Effect.sync(() => void (stored = read))),
        ),
  );

  const view = (bot: Stored): ReviewBotView => ({ slug: bot.slug, name: bot.name, installUrl: `${site}/apps/${bot.slug}/installations/new`, createdAt: bot.createdAt });

  // The one call that needs no token: the code is the credential. A redirect is never followed.
  const convert = (code: string) =>
    Effect.promise(async (): Promise<unknown> => {
      try {
        const response = await fetch(`${config.apiBase}/app-manifests/${code}/conversions`, { method: "POST", redirect: "manual", headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        return response.ok ? await response.json() : null;
      } catch {
        return null;
      }
    });

  const startSetup = Effect.fn("ReviewBot.startSetup")(function* (redirectBase: string, organization: string | undefined) {
    if (!LOOPBACK.test(redirectBase)) return yield* new ReviewBotError({ reason: "bad_redirect" });
    if (organization !== undefined && !ORGANIZATION.test(organization)) return yield* new ReviewBotError({ reason: "bad_organization" });
    return yield* lock.withPermits(1)(
      Effect.gen(function* () {
        if ((yield* current) !== null) return yield* new ReviewBotError({ reason: "exists" });
        const state = randomBytes(24).toString("base64url");
        pending = { state, expiresAt: (yield* Clock.currentTimeMillis) + SETUP_MS };
        const manifest = {
          // The owner can change the name on GitHub's page; App names are unique across GitHub.
          name: "runnerbox reviews",
          url: HOMEPAGE,
          redirect_url: `${redirectBase}${CREATED_PATH}`,
          public: false,
          default_permissions: { pull_requests: "write" },
          default_events: [],
        };
        const owner = organization === undefined ? "" : `/organizations/${organization}`;
        return { action: `${site}${owner}/settings/apps/new?state=${state}`, manifest: JSON.stringify(manifest) };
      }),
    );
  });

  const finishSetup = Effect.fn("ReviewBot.finishSetup")(function* (code: string, state: string) {
    return yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const waiting = pending;
        if (waiting === null || !CODE.test(code) || !sameText(waiting.state, state) || (yield* Clock.currentTimeMillis) > waiting.expiresAt) return "refused" as const;
        // Spent before GitHub is asked, so a second redirect with the same state does nothing.
        pending = null;
        const answer = decodeConversion(yield* convert(code));
        if (Option.isNone(answer)) return "refused" as const;
        const next: Stored = { v: 1, appId: answer.value.id, clientId: answer.value.client_id, slug: answer.value.slug, name: answer.value.name, privateKey: answer.value.pem, createdAt: new Date(yield* Clock.currentTimeMillis).toISOString() };
        stored = next;
        yield* fs.makeDirectory(serverDir, { recursive: true, mode: 0o700 }).pipe(Effect.andThen(writeFileAtomic(fs, path, `${JSON.stringify(next)}\n`)), Effect.mapError(unreadable));
        return "created" as const;
      }),
    );
  });

  const remove = lock.withPermits(1)(
    Effect.suspend(() => {
      stored = null;
      pending = null;
      return fs.remove(path, { force: true }).pipe(Effect.mapError(unreadable));
    }),
  );

  return ReviewBot.of({ status: Effect.map(current, (bot) => (bot === null ? null : view(bot))), startSetup, finishSetup, remove });
});

export const layer = Layer.effect(ReviewBot, make);
