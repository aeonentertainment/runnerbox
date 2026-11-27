import assert from "node:assert/strict";
import { test } from "node:test";
import { anchorOf, commentableLines } from "./diffLines.ts";

test("a finding's comment sits on lines its diff shows, over one hunk at most", () => {
  const diff = ["diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1,3 +1,4 @@", " one", "-two", "+TWO", "+2.5", " three", "@@ -20,2 +21,2 @@", " twenty", "+new", "diff --git a/gone.ts b/gone.ts", "--- a/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-x", ""].join("\n");
  const lines = commentableLines(diff);
  assert.deepEqual([...lines.keys()], ["a.ts"]);
  const at = (startLine: number, endLine: number) => anchorOf({ startLine, endLine }, lines.get("a.ts"));
  assert.deepEqual(at(2, 3), { start_line: 2, line: 3 });
  assert.deepEqual(at(3, 2), { start_line: 2, line: 3 });
  assert.deepEqual(at(3, 22), { line: 22 });
  assert.deepEqual(at(3, 15), { line: 3 });
  assert.equal(at(10, 15), null);
  assert.equal(anchorOf({ startLine: 1, endLine: 1 }, lines.get("missing.ts")), null);
});
