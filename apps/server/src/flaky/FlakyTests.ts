import { join } from "node:path";
import type { FlakyTests as FlakyTestsView } from "@runnerbox/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { writeFileAtomic } from "../config/atomicWrite.ts";
import * as ServerPaths from "../config/ServerPaths.ts";
import type { LogReadError } from "../history/StateLogs.ts";
import * as JobHistory from "../history/JobHistory.ts";
import { failedTests } from "../jobLogs/failedTests.ts";
import { flakyFrom, keyOf } from "./flakyFrom.ts";
import * as JobLogs from "../jobLogs/JobLogs.ts";

// Which tests flake: for every attempt that failed and then passed when retried, the tests its log
// says failed. What each log said is kept in `.server/failed-tests.json`, so a log is read from
// GitHub once; a log GitHub no longer has is kept as read with none.
const CacheFile = Schema.Struct({ v: Schema.Literal(1), jobs: Schema.Record(Schema.String, Schema.Array(Schema.String)) });
type CacheFile = typeof CacheFile.Type;
const decodeFile = Schema.decodeUnknownOption(Schema.fromJsonString(CacheFile));
// Logs read per ask, so a first look at a busy month answers in seconds and the rest follow.
const READS_PER_ASK = 15;
const RUNS_PER_REPO = 2000;


export class FlakyTests extends Context.Service<
  FlakyTests,
  {
    readonly list: (days: number) => Effect.Effect<FlakyTestsView, LogReadError>;
  }
>()("runnerbox/server/flaky/FlakyTests") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { serverDir } = yield* ServerPaths.ServerPaths;
  const history = yield* JobHistory.JobHistory;
  const logs = yield* JobLogs.JobLogs;
  const path = join(serverDir, "failed-tests.json");
  const lock = yield* Semaphore.make(1);

  const readCache = fs.readFileString(path).pipe(
    Effect.map((text) => Option.getOrElse(decodeFile(text), (): CacheFile => ({ v: 1, jobs: {} }))),
    Effect.orElseSucceed((): CacheFile => ({ v: 1, jobs: {} })),
  );

  const list = Effect.fn("FlakyTests.list")(function* (days: number) {
    const repos = yield* history.repos;
    const runs = (yield* Effect.forEach(repos, (repo) => history.runs({ repo, days, limit: RUNS_PER_REPO }))).flat();
    const flaky = runs.filter((run) => run.verdict === "flaky").toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const cache = yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const kept = yield* readCache;
        const jobs = { ...kept.jobs };
        for (const run of flaky.filter((each) => jobs[keyOf(each)] === undefined).slice(0, READS_PER_ASK)) {
          // GitHub keeps logs for a while; one it no longer has never comes back. Any other failure
          // is left unread, to try again on the next ask.
          const tests = yield* logs.read(run.repo, run.jobId).pipe(
            Effect.map(failedTests),
            Effect.catchTag("JobLogError", (error) => Effect.succeed(error.reason === "gone" ? [] : null)),
          );
          if (tests !== null) jobs[keyOf(run)] = tests;
        }
        const next = { v: 1 as const, jobs };
        yield* fs.makeDirectory(serverDir, { recursive: true, mode: 0o700 }).pipe(Effect.andThen(writeFileAtomic(fs, path, `${JSON.stringify(next)}\n`)), Effect.ignore);
        return next;
      }),
    );
    return flakyFrom(flaky, (run) => cache.jobs[keyOf(run)]);
  });

  return FlakyTests.of({ list });
});

export const layer = Layer.effect(FlakyTests, make);
