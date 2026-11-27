import { RerunError } from "@runnerbox/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as GitHub from "../github/GitHub.ts";
import { githubRequest } from "../github/githubRequest.ts";
import { QueueConfig } from "../runners/QueueConfig.ts";

export class Reruns extends Context.Service<
  Reruns,
  {
    // Asks GitHub to run one job again, through the server's sign-in, on a repository the App is installed on.
    readonly rerun: (repo: string, jobId: number) => Effect.Effect<void, RerunError>;
  }
>()("runnerbox/server/reruns/Reruns") {}

const make = Effect.gen(function* () {
  const github = yield* GitHub.GitHub;
  const { apiBase } = yield* QueueConfig;
  const unreachable = () => new RerunError({ reason: "github_unreachable" });

  const rerun = Effect.fn("Reruns.rerun")(function* (repo: string, jobId: number) {
    const reached = yield* github.reach.pipe(Effect.mapError(unreachable));
    if (reached === null) return yield* new RerunError({ reason: "not_connected" });
    if (!reached.repos.includes(repo)) return yield* new RerunError({ reason: reached.problem === null ? "not_installed" : "github_unreachable" });
    const reply = yield* Effect.promise(() => githubRequest(apiBase, "POST", `repos/${repo}/actions/jobs/${jobId}/rerun`, reached.token, {}));
    if (reply.kind === "ok") return;
    if (reply.kind === "refused") return yield* new RerunError({ reason: reply.status === 404 ? "not_found" : "not_connected" });
    return yield* new RerunError({ reason: reply.status === 403 || reply.status === 422 ? "refused" : "github_unreachable" });
  });

  return Reruns.of({ rerun });
});

export const layer = Layer.effect(Reruns, make);
