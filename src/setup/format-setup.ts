import type { SetupStep, Verdict } from "./setup-check.ts";

const MARK: Record<Verdict, string> = { ok: "ok", fixable: "fix", manual: "note", skipped: "skip", failed: "FAIL" };

// `runnerbox setup check` for a person: one line per check, with why under anything not ok.
export function formatSetup(steps: SetupStep[]) {
  const lines: string[] = [];
  for (const step of steps) {
    lines.push(step.title);
    for (const check of step.checks) {
      const fix = check.fix ? `  (fix: ${check.fix.id}${check.fix.sudo ? ", needs sudo" : ""})` : "";
      lines.push(`  ${MARK[check.verdict].padEnd(4)}  ${check.title}${check.verdict === "fixable" ? fix : ""}`);
      if (check.detail && check.verdict !== "ok") lines.push(`        ${check.detail}`);
    }
  }
  return lines.join("\n");
}
