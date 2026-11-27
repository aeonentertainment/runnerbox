import assert from "node:assert/strict";
import { test } from "node:test";
import { failedTests } from "./failedTests.ts";

test("a log's failed tests are read from the lines node:test, Vitest, Jest, pytest, Go and Rust print, and nothing else", () => {
  const lines = [
    "✔ passes (1.2ms)",
    "✖ a job whose runner is gone waits again (3.1ms)",
    "✖ failing tests:",
    "✖ waits for a free slot",
    "   × the cache keeps its key 14ms",
    "  ✕ renders the empty list (5 ms)",
    "FAILED tests/test_queue.py::test_retry - AssertionError: 1 != 2",
    "--- FAIL: TestWaitForRunner (0.02s)",
    "test queue::tests::retries ... FAILED",
    "test queue::tests::passes ... ok",
    "Error: something unrelated",
  ];
  assert.deepEqual(failedTests({ cut: false, sections: [{ title: "Run tests", failed: true, lines: lines.map((text) => ({ text })) }] }), [
    "a job whose runner is gone waits again",
    "waits for a free slot",
    "the cache keeps its key",
    "renders the empty list",
    "tests/test_queue.py::test_retry",
    "TestWaitForRunner",
    "queue::tests::retries",
  ]);
});
