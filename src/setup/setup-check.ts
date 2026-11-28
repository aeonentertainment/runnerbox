// What `runnerbox setup check` reports. A machine is ready when nothing is `fixable` or `failed`.
// `fixable` checks name the fix `runnerbox setup fix` will run. `manual` ones are advice only a
// person can act on, such as a BIOS setting, and are probed again rather than ever marked done.
export type Verdict = "ok" | "fixable" | "manual" | "skipped" | "failed";

export type SetupCheck = {
  id: string;
  title: string;
  verdict: Verdict;
  // Why it isn't ok, and what to do, in a sentence or two.
  detail?: string;
  fix?: SetupFix;
};

export type SetupFix = { id: string; sudo: boolean };

export type SetupStep = { id: string; title: string; checks: SetupCheck[] };

export const ok = (id: string, title: string): SetupCheck => ({ id, title, verdict: "ok" });
