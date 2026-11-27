import type { JobLog } from "@runnerbox/contracts";

// The tests a job's log says failed, read from the lines the common runners print for a failing
// test. A runner whose output isn't one of these gives nothing, never a guess.
const PATTERNS: ReadonlyArray<RegExp> = [
  // node:test, as `✖ name (12.3ms)`, the time left out by some reporters.
  /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?m?s\))?$/,
  // Vitest and Jest, as `× name 12ms` or `✕ name (12 ms)`.
  /^\s*[×✕] (.+?)(?: \(?\d+(?:\.\d+)? ?m?s\)?)?$/,
  // pytest's short summary, as `FAILED tests/test_a.py::test_b - AssertionError`.
  /^FAILED (\S+::\S+)/,
  // Go, as `--- FAIL: TestName (0.01s)`.
  /^\s*--- FAIL: (\S+)/,
  // Rust, as `test module::name ... FAILED`.
  /^test (\S+) \.\.\. FAILED$/,
];
const MAX_TESTS = 50;

export function failedTests(log: JobLog) {
  const found = new Set<string>();
  for (const section of log.sections) {
    for (const line of section.lines) {
      for (const pattern of PATTERNS) {
        const name = pattern.exec(line.text)?.[1]?.trim();
        // node:test's summary repeats each failure under this heading, which isn't a test.
        if (name && name !== "failing tests:") found.add(name.slice(0, 300));
      }
      if (found.size >= MAX_TESTS) return [...found];
    }
  }
  return [...found];
}
