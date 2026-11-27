import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Review, ReviewFinding } from "@runnerbox/contracts";

const DAY_MS = 24 * 60 * 60_000;
const finding = (priority: "P1" | "P2", title: string, path: string, startLine: number): ReviewFinding => ({ priority, title, path, startLine, endLine: startLine + 2, body: "What goes wrong, the case that shows it, and which way to fix it.", rule: null, code: [] });

// Finished reviews of the fixture's older pull requests over the last two weeks, so Analytics has
// days to draw and findings to list: some fixed by a later push, some still reported, some not yet reviewed again.
export async function writeReviewHistory(stateDir: string, now: number) {
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY_MS).toISOString();
  const review = (number: number, title: string, daysAgo: number, findings: ReadonlyArray<ReviewFinding>, index: number): Review => ({
    id: `history-${number}-${index}`, repo: "owner/name", number, title, author: "someone", branch: `fix/${number}`, base: "main", headSha: String(number * 10 + index).padStart(40, "a"),
    additions: 40, deletions: 12, changedFiles: 3, state: "done", startedAt: at(daysAgo), finishedAt: at(daysAgo - 0.01), model: "opus", costUsd: 0.4, filesRead: 6,
    score: findings.some((each) => each.priority === "P1") ? 3 : findings.length > 0 ? 4 : 5, impact: "medium", reach: "Touches the queue and its callers.", verdict: findings.length > 0 ? "Fix the findings first." : "Safe to merge.", findings, problem: null,
  });
  const pulls: ReadonlyArray<readonly [number, string, ReadonlyArray<readonly [number, ReadonlyArray<ReviewFinding>]>]> = [
    [30, "Cache the runner list", [[12, [finding("P1", "A stale list hides a new runner", "src/runners.ts", 40), finding("P2", "The cache key ignores the label", "src/runners.ts", 18)]], [10, [finding("P1", "A stale list hides a new runner", "src/runners.ts", 42)]], [9, []]]],
    [32, "Retry a failed upload", [[8, [finding("P1", "Retries never back off", "src/upload.ts", 77)]], [6, [finding("P1", "Retries never back off", "src/upload.ts", 77)]]]],
    [34, "Rename the queue states", [[5, []]]],
    [36, "Show the wait per label", [[3, [finding("P2", "A label with no jobs divides by zero", "src/wait.ts", 21)]], [1, []]]],
    [37, "Stream job logs", [[1, [finding("P1", "A closed tab keeps the stream open", "src/logs.ts", 55), finding("P2", "Long lines are cut mid-character", "src/logs.ts", 90)]]]],
  ];
  const dir = join(stateDir, ".server", "reviews", "owner", "name");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (const [number, title, runs] of pulls) {
    const reviews = runs.map(([daysAgo, findings], index) => review(number, title, daysAgo, findings, index)).toReversed();
    await writeFile(join(dir, `${number}.json`), `${JSON.stringify({ v: 1, reviews })}\n`, { mode: 0o600 });
  }
}
