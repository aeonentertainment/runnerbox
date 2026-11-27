import assert from "node:assert/strict";
import { test } from "node:test";
import type { AlertRule, JobRun, Review } from "@runnerbox/contracts";
import { firedAlerts } from "./firedAlerts.ts";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 10, minute)).toISOString();
let ids = 0;
const run = (minute: number, conclusion: string, changed: Partial<JobRun> = {}): JobRun => ({
  repo: "owner/name", jobId: (ids += 1), runId: 1, attempt: 1, workflow: "ci", job: "test", branch: "main", headSha: null, conclusion, runner: "r", runnerType: "linux",
  createdAt: at(minute - 5), startedAt: at(minute - 4), completedAt: at(minute), durationMs: 4 * 60_000, queueMs: 60_000, verdict: null, starved: false, ...changed,
});
const rule = (kind: AlertRule["kind"], changed: Partial<AlertRule> = {}): AlertRule => ({ id: kind, kind, enabled: true, repo: null, branch: null, job: null, threshold: null, ...changed });

test("rules fire for what finished since the last check, a streak once when it reaches its count, and a review with a P1", () => {
  const since = Date.parse(at(20));
  const runs = [run(10, "failure"), run(21, "failure"), run(22, "failure", { branch: "feat/x" }), run(23, "success", { job: "build", durationMs: 20 * 60_000, queueMs: 5 * 60_000 })];
  const review: Review = {
    id: "r1", repo: "owner/name", number: 7, title: "t", author: "a", branch: "b", base: "main", headSha: "a".repeat(40), additions: 1, deletions: 0, changedFiles: 1, state: "done", startedAt: at(20), finishedAt: at(24),
    model: "opus", costUsd: null, filesRead: 0, score: 3, impact: "low", reach: null, verdict: null, problem: null,
    findings: [{ priority: "P1", title: "x", path: "a.ts", startLine: 1, endLine: 1, body: "b", rule: null, code: [] }],
  };
  const fired = firedAlerts({
    rules: [rule("job_failed", { branch: "main" }), rule("fails_in_a_row", { threshold: 2 }), rule("slow_job", { threshold: 15 }), rule("long_wait", { threshold: 2, job: "BUILD" }), rule("review_p1"), rule("job_failed", { id: "off", enabled: false })],
    runs,
    reviews: [review],
    isNew: (key) => key.startsWith("review:") || runs.some((each) => `run:${each.repo}:${each.jobId}` === key && Date.parse(each.completedAt ?? "") > since),
    now: Date.parse(at(25)),
  });
  assert.deepEqual(fired.map((alert) => alert.title), [
    "ci / test failed on main in owner/name",
    "ci / test failed 2 times in a row on main in owner/name",
    "ci / build took 20m, over 15m on main in owner/name",
    "ci / build waited 5m for a runner on main in owner/name",
    "A review found 1 to fix before merging in owner/name #7",
  ]);
  // A third failure in a row doesn't fire the streak again.
  const next = run(26, "failure");
  const third = firedAlerts({ rules: [rule("fails_in_a_row", { threshold: 2 })], runs: [...runs, next], reviews: [], isNew: (key) => key === `run:owner/name:${next.jobId}`, now: Date.parse(at(27)) });
  assert.deepEqual(third, []);
});
