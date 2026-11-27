import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LINES, parseJobLog } from "./parseJobLog.ts";

test("a job's log loses its timestamps and colours, splits at its groups, marks errors, and keeps its end", () => {
  const log = [
    "2026-11-20T10:00:00.1234567Z Starting the job",
    "2026-11-20T10:00:01.0000000Z ##[group]Run pnpm test",
    "2026-11-20T10:00:02.0000000Z \u001b[31mFAIL\u001b[0m src/a.test.ts",
    "2026-11-20T10:00:03.0000000Z ##[error]Process completed with exit code 1.",
    "2026-11-20T10:00:03.5000000Z ##[endgroup]",
    "2026-11-20T10:00:04.0000000Z Cleaning up",
    "",
  ].join("\n");
  assert.deepEqual(parseJobLog(log), {
    cut: false,
    sections: [
      { title: "", lines: [{ text: "Starting the job" }], failed: false },
      { title: "Run pnpm test", lines: [{ text: "FAIL src/a.test.ts" }, { text: "Process completed with exit code 1.", error: true }], failed: true },
      { title: "", lines: [{ text: "Cleaning up" }], failed: false },
    ],
  });
  const long = parseJobLog(Array.from({ length: MAX_LINES + 5 }, (_, index) => `line ${index}`).join("\n"));
  assert.deepEqual([long.cut, long.sections[0]?.lines[0]?.text, long.sections[0]?.lines.length], [true, "line 5", MAX_LINES]);
});
