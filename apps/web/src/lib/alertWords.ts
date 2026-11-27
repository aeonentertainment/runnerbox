import type { AlertKind, AlertRule } from "@runnerbox/contracts";

export const ALERT_KINDS: ReadonlyArray<readonly [AlertKind, string]> = [
  ["job_failed", "A job fails"],
  ["fails_in_a_row", "A job fails several times in a row"],
  ["slow_job", "A job takes too long"],
  ["long_wait", "A job waits too long for a runner"],
  ["review_p1", "A review finds something to fix"],
];

// What the threshold counts, for the kinds that have one.
export const THRESHOLD = { fails_in_a_row: ["times", 2], slow_job: ["minutes", 15], long_wait: ["minutes", 2] } as const satisfies Partial<Record<AlertKind, readonly [string, number]>>;
export const hasThreshold = (kind: AlertKind): kind is keyof typeof THRESHOLD => kind in THRESHOLD;

// A rule as a sentence: "ci / test fails on main in owner/name".
export function ruleWords(rule: AlertRule) {
  const job = rule.job === null ? "a job" : `a job named like “${rule.job}”`;
  const where = `${rule.branch === null ? "" : ` on ${rule.branch}`}${rule.repo === null ? "" : ` in ${rule.repo}`}`;
  switch (rule.kind) {
    case "job_failed":
      return `When ${job} fails${where}`;
    case "fails_in_a_row":
      return `When ${job} fails ${rule.threshold ?? 2} times in a row${where}`;
    case "slow_job":
      return `When ${job} takes over ${rule.threshold ?? 15} minutes${where}`;
    case "long_wait":
      return `When ${job} waits over ${rule.threshold ?? 2} minutes for a runner${where}`;
    case "review_p1":
      return `When a review finds something to fix before merging${rule.repo === null ? "" : ` in ${rule.repo}`}`;
  }
}
