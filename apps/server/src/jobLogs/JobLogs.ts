import { type JobLog, JobLogError } from "@runnerbox/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as GitHub from "../github/GitHub.ts";
import { QueueConfig } from "../runners/QueueConfig.ts";
import { fetchJobLog } from "./fetchJobLog.ts";
import { parseJobLog } from "./parseJobLog.ts";

const TIMEOUT = "60 seconds";

export class JobLogs extends Context.Service<
  JobLogs,
  {
    // A job's log, read from GitHub now through the server's sign-in. Nothing of it is kept.
    readonly read: (repo: string, jobId: number) => Effect.Effect<JobLog, JobLogError>;
  }
>()("runnerbox/server/jobLogs/JobLogs") {}

const make = Effect.gen(function* () {
  const github = yield* GitHub.GitHub;
  const { apiBase } = yield* QueueConfig;
  const unreachable = () => new JobLogError({ reason: "github_unreachable" });

  const read = Effect.fn("JobLogs.read")(function* (repo: string, jobId: number) {
    const reached = yield* github.reach.pipe(Effect.mapError(unreachable));
    if (reached === null) return yield* new JobLogError({ reason: "not_connected" });
    if (!reached.repos.includes(repo)) return yield* new JobLogError({ reason: reached.problem === null ? "not_installed" : "github_unreachable" });
    const fetched = yield* Effect.promise((signal) => fetchJobLog(apiBase, repo, jobId, reached.token, signal)).pipe(Effect.timeoutOrElse({ duration: TIMEOUT, orElse: () => Effect.succeed({ kind: "error" as const }) }));
    if (fetched.kind === "gone") return yield* new JobLogError({ reason: "gone" });
    if (fetched.kind === "error") return yield* unreachable();
    const log = parseJobLog(fetched.text);
    return { ...log, cut: log.cut || fetched.cut };
  });

  return JobLogs.of({ read });
});

export const layer = Layer.effect(JobLogs, make);
