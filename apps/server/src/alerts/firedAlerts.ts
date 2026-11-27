import type { AlertRule, FiredAlert, JobRun, Review } from "@runnerbox/contracts";

// How a job and a review are known between checks.
export const runKey = (run: JobRun) => `run:${run.repo}:${run.jobId}`;
export const reviewKey = (review: Review) => `review:${review.id}`;

const failed = (run: JobRun) => run.conclusion === "failure" || run.conclusion === "timed_out";
const name = (run: JobRun) => (run.workflow ? `${run.workflow} / ${run.job}` : run.job);
const minutes = (ms: number) => `${Math.round(ms / 60_000)}m`;

const matches = (rule: AlertRule, run: JobRun) =>
  (rule.repo === null || rule.repo === run.repo) &&
  (rule.branch === null || rule.branch === run.branch) &&
  (rule.job === null || name(run).toLowerCase().includes(rule.job.toLowerCase()));

// What fires for one job that finished since the last check. `before` is the same job's earlier
// finished attempts on its branch, newest first.
function forRun(rule: AlertRule, run: JobRun, before: ReadonlyArray<JobRun>): string | null {
  const where = `${run.branch ? ` on ${run.branch}` : ""} in ${run.repo}`;
  switch (rule.kind) {
    case "job_failed":
      return failed(run) ? `${name(run)} failed${where}` : null;
    case "fails_in_a_row": {
      const times = rule.threshold ?? 2;
      // Once per streak: when it reaches the count, not again while it goes on.
      const streak = [run, ...before].findIndex((each) => !failed(each));
      return (streak === -1 ? before.length + 1 : streak) === times ? `${name(run)} failed ${times} times in a row${where}` : null;
    }
    case "slow_job": {
      const over = (rule.threshold ?? 15) * 60_000;
      return run.durationMs !== null && run.durationMs > over ? `${name(run)} took ${minutes(run.durationMs)}, over ${minutes(over)}${where}` : null;
    }
    case "long_wait": {
      const over = (rule.threshold ?? 2) * 60_000;
      return run.queueMs !== null && run.queueMs > over ? `${name(run)} waited ${minutes(run.queueMs)} for a runner${where}` : null;
    }
    case "review_p1":
      return null;
  }
}

// The alerts the enabled rules fire for the finished jobs and done reviews `isNew` hasn't seen.
// Jobs are known by ID, not time, since a job's record can arrive well after it finished. `runs` is
// every recent run, any order; earlier ones decide streaks.
export function firedAlerts(input: { readonly rules: ReadonlyArray<AlertRule>; readonly runs: ReadonlyArray<JobRun>; readonly reviews: ReadonlyArray<Review>; readonly isNew: (id: string) => boolean; readonly now: number }): FiredAlert[] {
  const at = new Date(input.now).toISOString();
  const finished = input.runs.filter((run) => run.completedAt !== null).toSorted((a, b) => Date.parse(b.completedAt ?? "") - Date.parse(a.completedAt ?? ""));
  const fresh = finished.filter((run) => input.isNew(runKey(run)));
  const alerts: FiredAlert[] = [];
  for (const rule of input.rules.filter((each) => each.enabled)) {
    for (const run of fresh) {
      if (!matches(rule, run)) continue;
      const before = finished.filter((each) => each !== run && each.repo === run.repo && each.branch === run.branch && name(each) === name(run) && Date.parse(each.completedAt ?? "") < Date.parse(run.completedAt ?? ""));
      const title = forRun(rule, run, before);
      if (title !== null) alerts.push({ id: `${rule.id}:run:${run.jobId}`, ruleId: rule.id, kind: rule.kind, title, subject: { _tag: "run", repo: run.repo, jobId: run.jobId }, at });
    }
    if (rule.kind !== "review_p1") continue;
    for (const review of input.reviews) {
      if (review.state !== "done" || !input.isNew(reviewKey(review)) || (rule.repo !== null && rule.repo !== review.repo)) continue;
      const p1 = review.findings.filter((finding) => finding.priority === "P1").length;
      if (p1 === 0) continue;
      alerts.push({ id: `${rule.id}:review:${review.id}`, ruleId: rule.id, kind: rule.kind, title: `A review found ${p1} to fix before merging in ${review.repo} #${review.number}`, subject: { _tag: "pull", repo: review.repo, number: review.number }, at });
    }
  }
  return alerts;
}
