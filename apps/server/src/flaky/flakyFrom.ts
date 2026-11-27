import type { FlakyTests, JobRun } from "@runnerbox/contracts";

export const keyOf = (run: JobRun) => `${run.repo}:${run.jobId}`;
const nameOf = (run: JobRun) => (run.workflow ? `${run.workflow} / ${run.job}` : run.job);

// Each test the flaky attempts' logs name, counted once per run it flaked in. `testsOf` is what an
// attempt's log said, or undefined while it's unread. `flaky` is the newest first.
export function flakyFrom(flaky: ReadonlyArray<JobRun>, testsOf: (run: JobRun) => ReadonlyArray<string> | undefined): FlakyTests {
  const byTest = new Map<string, { repo: string; job: string; test: string; runs: Set<number>; lastAt: string; jobIds: number[] }>();
  for (const run of flaky) {
    for (const test of testsOf(run) ?? []) {
      const key = `${run.repo}\n${nameOf(run)}\n${test}`;
      const entry = byTest.get(key) ?? { repo: run.repo, job: nameOf(run), test, runs: new Set<number>(), lastAt: run.createdAt, jobIds: [] };
      entry.runs.add(run.runId);
      if (entry.jobIds.length < 5) entry.jobIds.push(run.jobId);
      byTest.set(key, entry);
    }
  }
  return {
    tests: [...byTest.values()].map(({ runs, ...entry }) => ({ ...entry, flakes: runs.size })).toSorted((a, b) => b.flakes - a.flakes || Date.parse(b.lastAt) - Date.parse(a.lastAt)),
    flakyJobs: flaky.length,
    unread: flaky.filter((run) => testsOf(run) === undefined).length,
  };
}
