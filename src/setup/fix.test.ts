import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, test } from "node:test";
import { FIXES, fixScript, isFixId } from "./fixes.ts";
import { runFix } from "./run-fix.ts";

const dir = await mkdtemp(join(tmpdir(), "runnerbox-fix-"));
after(() => rm(dir, { recursive: true }));

test("every fix is a script bash can parse, and a username that could inject is refused", () => {
  for (const id of Object.keys(FIXES)) {
    assert.ok(isFixId(id));
    execFileSync("bash", ["-n"], { input: fixScript(id, "owner") });
  }
  assert.throws(() => fixScript("linger", "owner; reboot"));
  assert.throws(() => fixScript("vm-tools", "$(id)"));
});

// A stand-in for sudo that records its arguments and what it read on stdin.
async function fakeSudo() {
  const path = join(dir, "sudo");
  await writeFile(path, `#!/bin/sh\nprintf '%s\\n' "$@" > ${dir}/args\ncat > ${dir}/stdin\n`);
  await chmod(path, 0o755);
  const read = async () => ({ args: await readFile(join(dir, "args"), "utf8"), stdin: await readFile(join(dir, "stdin"), "utf8") });
  return { path, read };
}

test("without a terminal, the password reaches sudo on stdin and never its arguments", async () => {
  const sudo = await fakeSudo();
  const code = await runFix({ id: "linger", user: "owner", input: Readable.from(["hunter2\nrest\n"]), sudoBinary: sudo.path });
  assert.equal(code, 0);
  const { args, stdin } = await sudo.read();
  assert.equal(stdin, "hunter2\n");
  assert.ok(!args.includes("hunter2"));
  assert.match(args, /^-S\n-p\n\n--\nbash\n-c\nset -eu\nloginctl enable-linger owner\n/);
});

test("an empty first line asks sudo to run without a password, and fails rather than prompt", async () => {
  const sudo = await fakeSudo();
  await runFix({ id: "mask-sleep", user: "owner", input: Readable.from(["\n"]), sudoBinary: sudo.path });
  assert.match((await sudo.read()).args, /^-n\n--\n/);
});
