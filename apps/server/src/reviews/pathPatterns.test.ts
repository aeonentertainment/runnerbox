import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesAny } from "./pathPatterns.ts";

test("ignore patterns follow .gitignore: any depth unless anchored, a directory covers what's inside", () => {
  const cases: ReadonlyArray<readonly [string, string, boolean]> = [
    ["dist", "dist/app.js", true],
    ["dist", "apps/web/dist/app.js", true],
    ["dist/", "apps/dist/a.js", true],
    ["/dist", "apps/web/dist/app.js", false],
    ["/dist", "dist/app.js", true],
    ["*.lock", "a/b/yarn.lock", true],
    ["*.lock", "a/lockfile", false],
    ["src/*.ts", "src/a.ts", true],
    ["src/*.ts", "src/deep/a.ts", false],
    ["src/*.ts", "apps/src/a.ts", false],
    ["src/**/*.ts", "src/deep/er/a.ts", true],
    ["**/generated", "a/generated/x.ts", true],
    ["docs/**", "docs/a/b.md", true],
    ["a?.ts", "ab.ts", true],
    ["a?.ts", "a/.ts", false],
    ["a+b(c).ts", "a+b(c).ts", true],
    ["  ", "anything", false],
  ];
  for (const [pattern, path, expected] of cases) assert.equal(matchesAny([pattern])(path), expected, `${pattern} on ${path}`);
});
