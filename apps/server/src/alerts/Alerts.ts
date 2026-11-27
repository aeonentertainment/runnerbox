import { join } from "node:path";
import { AlertRule, AlertsError, type AlertsView, FiredAlert, MAX_ALERT_RULES } from "@runnerbox/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { writeFileAtomic } from "../config/atomicWrite.ts";
import * as ServerPaths from "../config/ServerPaths.ts";
import * as JobHistory from "../history/JobHistory.ts";
import * as ReviewStore from "../reviews/ReviewStore.ts";
import { firedAlerts, reviewKey, runKey } from "./firedAlerts.ts";

// The owner's alert rules and what they fired, in `.server/alerts.json`. Once a minute the jobs of
// the last two days and the kept reviews are checked against the rules. `seen` holds the jobs and
// reviews already checked, so each fires at most once, and the first check only notes what's there.
const AlertsFile = Schema.Struct({
  v: Schema.Literal(1),
  rules: Schema.Array(AlertRule),
  fired: Schema.Array(FiredAlert),
  seen: Schema.optionalKey(Schema.Array(Schema.String)),
});
type AlertsFile = typeof AlertsFile.Type;
const decodeFile = Schema.decodeUnknownEffect(Schema.fromJsonString(AlertsFile));
const NONE: AlertsFile = { v: 1, rules: [], fired: [] };
const KEPT_FIRED = 100;
const WINDOW_DAYS = 2;
const RUNS_PER_REPO = 500;

export class Alerts extends Context.Service<
  Alerts,
  {
    readonly status: (may: { readonly configure: boolean }) => Effect.Effect<AlertsView, AlertsError>;
    readonly setRules: (rules: ReadonlyArray<AlertRule>, may: { readonly configure: boolean }) => Effect.Effect<AlertsView, AlertsError>;
    // One check, which also runs every minute.
    readonly check: Effect.Effect<void>;
    // Each alert as it fires, for whatever sends alerts beyond the app.
    readonly fired: Stream.Stream<FiredAlert>;
  }
>()("runnerbox/server/alerts/Alerts") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { serverDir } = yield* ServerPaths.ServerPaths;
  const history = yield* JobHistory.JobHistory;
  const store = yield* ReviewStore.ReviewStore;
  const path = join(serverDir, "alerts.json");
  const unreadable = () => new AlertsError({ reason: "unreadable" });
  const lock = yield* Semaphore.make(1);
  const firing = yield* PubSub.unbounded<FiredAlert>();

  const read = fs.readFileString(path).pipe(
    Effect.map(Option.some),
    Effect.catchTag("PlatformError", (error) => (error.reason._tag === "NotFound" ? Effect.succeed(Option.none<string>()) : Effect.fail(error))),
    Effect.flatMap((text) => (Option.isSome(text) ? decodeFile(text.value) : Effect.succeed(NONE))),
    Effect.mapError(unreadable),
  );
  const write = (file: AlertsFile) =>
    fs.makeDirectory(serverDir, { recursive: true, mode: 0o700 }).pipe(Effect.andThen(writeFileAtomic(fs, path, `${JSON.stringify(file)}\n`)), Effect.mapError(unreadable));
  const view = (file: AlertsFile, may: { readonly configure: boolean }): AlertsView => ({ rules: file.rules, fired: file.fired, canConfigure: may.configure });

  const status = (may: { readonly configure: boolean }) => read.pipe(Effect.map((file) => view(file, may)));

  const setRules = Effect.fn("Alerts.setRules")(function* (rules: ReadonlyArray<AlertRule>, may: { readonly configure: boolean }) {
    if (rules.length > MAX_ALERT_RULES) return yield* new AlertsError({ reason: "too_many" });
    const file = yield* lock.withPermits(1)(read.pipe(Effect.map((kept) => ({ ...kept, rules })), Effect.tap(write)));
    return view(file, may);
  });

  const pass = Effect.gen(function* () {
    const repos = yield* history.repos;
    const runs = (yield* Effect.forEach(repos, (repo) => history.runs({ repo, days: WINDOW_DAYS, limit: RUNS_PER_REPO }))).flat();
    const reviews = yield* store.all;
    const now = yield* Clock.currentTimeMillis;
    const keys = [...runs.filter((run) => run.completedAt !== null).map(runKey), ...reviews.filter((review) => review.state === "done").map(reviewKey)];
    const fresh = yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const file = yield* read;
        const seen = new Set(file.seen ?? keys);
        const known = new Set(file.fired.map((alert) => alert.id));
        const fired = firedAlerts({ rules: file.rules, runs, reviews, isNew: (key) => !seen.has(key), now }).filter((alert) => !known.has(alert.id));
        // Only what's still in the window is kept as seen, so the list stays the window's size.
        yield* write({ ...file, fired: [...fired, ...file.fired].slice(0, KEPT_FIRED), seen: keys });
        return fired;
      }),
    );
    yield* PubSub.publishAll(firing, fresh);
  });
  // A check that fails, with a log unreadable, is tried again in a minute.
  const check = pass.pipe(Effect.ignore);

  yield* Effect.forkScoped(check.pipe(Effect.repeat(Schedule.spaced("1 minute"))));
  return Alerts.of({ status, setRules, check, fired: Stream.fromPubSub(firing) });
});

export const layer = Layer.effect(Alerts, make);
