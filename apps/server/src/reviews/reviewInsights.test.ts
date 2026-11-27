import assert from "node:assert/strict";
import { test } from "node:test";
import type { Review, ReviewFinding } from "@runnerbox/contracts";
import { reviewInsights } from "./reviewInsights.ts";

const finding = (title: string, startLine: number, priority: "P1" | "P2" = "P1"): ReviewFinding => ({ priority, title, path: "src/a.ts", startLine, endLine: startLine, body: "b", rule: null, code: [] });
const review = (id: string, number: number, startedAt: string, findings: ReadonlyArray<ReviewFinding>, state: Review["state"] = "done"): Review => ({
  id, repo: "owner/name", number, title: `Pull ${number}`, author: "someone", branch: "b", base: "main", headSha: id.padEnd(40, "0"), additions: 1, deletions: 0, changedFiles: 1, state, startedAt, finishedAt: startedAt, model: "opus", costUsd: null, filesRead: 0, score: 3, impact: "low", reach: null, verdict: null, findings, problem: null,
});

test("a finding is counted once, where it was first reported, and addressed once a later review stops reporting it", () => {
  const insights = reviewInsights(
    [
      // Pull 1: the same defect reworded and moved two lines, then fixed. The P2 is fixed at once.
      review("a1", 1, "2026-11-20T10:00:00Z", [finding("Leaving can join again", 10), finding("Typo in a log", 40, "P2")]),
      review("a2", 1, "2026-11-21T10:00:00Z", [finding("A user who left rejoins", 12)]),
      review("a3", 1, "2026-11-22T10:00:00Z", []),
      // Pull 2: reviewed once, so nothing is decided yet. A failed review doesn't count.
      review("b1", 2, "2026-11-22T11:00:00Z", [finding("Lost write", 5)]),
      review("b2", 2, "2026-11-22T12:00:00Z", [], "failed"),
      // Pull 3: still reported by the latest review.
      review("c1", 3, "2026-11-21T09:00:00Z", [finding("Retries forever", 7)]),
      review("c2", 3, "2026-11-22T09:00:00Z", [finding("Retries forever", 7)]),
      // Before the window.
      review("d1", 4, "2026-11-01T09:00:00Z", [finding("Old", 1)]),
    ],
    Date.parse("2026-11-23T00:00:00Z"),
    7,
  );
  assert.deepEqual(insights.findings.map(({ title, number, addressed }) => [title, number, addressed]), [
    ["Lost write", 2, null],
    ["Retries forever", 3, false],
    ["Leaving can join again", 1, true],
    ["Typo in a log", 1, true],
  ]);
  assert.deepEqual([insights.pulls, insights.reviews], [3, 6]);
  assert.deepEqual(insights.days.filter((day) => day.first + day.again > 0).map(({ day, first, again, p1, p2 }) => [day, first, again, p1, p2]), [
    ["2026-11-20", 1, 0, 1, 1],
    ["2026-11-21", 1, 1, 1, 0],
    ["2026-11-22", 1, 2, 1, 0],
  ]);
  assert.deepEqual(insights.repos, [{ repo: "owner/name", reviews: 6, findings: 4 }]);
});
