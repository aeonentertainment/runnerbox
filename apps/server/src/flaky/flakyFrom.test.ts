import assert from "node:assert/strict";
import { test } from "node:test";
import type { JobRun } from "@runnerbox/contracts";
import { flakyFrom } from "./flakyFrom.ts";

const run = (jobId: number, runId: number, day: number): JobRun => ({
  repo: "owner/name", jobId, runId, attempt: 1, workflow: "ci", job: "test", branch: "main", headSha: null, conclusion: "failure", runner: "r", runnerType: "linux",
  createdAt: new Date(Date.UTC(2026, 10, day)).toISOString(), startedAt: null, completedAt: null, durationMs: null, queueMs: null, verdict: "flaky", starved: false,
});

test("a flaky test is counted once per run, the most flakes first, and an unread log counts as unread, not as none", () => {
  const runs = [run(4, 30, 20), run(3, 20, 19), run(2, 20, 19), run(1, 10, 18)];
  const said: Record<number, ReadonlyArray<string>> = { 4: ["retries"], 3: ["retries", "label"], 2: ["retries"] };
  const view = flakyFrom(runs, (each) => said[each.jobId]);
  assert.deepEqual(view.tests.map(({ test, flakes, jobIds }) => [test, flakes, jobIds]), [["retries", 2, [4, 3, 2]], ["label", 1, [3]]]);
  assert.deepEqual([view.flakyJobs, view.unread], [4, 1]);
});
