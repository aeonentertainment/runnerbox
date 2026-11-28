import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { userInfo } from "node:os";

// Everything a setup check reads from the machine. Checks only read, so tests hand them a fake.
export type Probe = {
  user: string;
  // A command's exit code and output. A command that isn't installed exits 127, as in a shell.
  run: (command: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  // A file's contents, or null when it doesn't exist or can't be read.
  read: (path: string) => Promise<string | null>;
  // A directory's entries, or none when it doesn't exist.
  list: (dir: string) => Promise<string[]>;
  exists: (path: string) => Promise<boolean>;
};

export function createLocalProbe(): Probe {
  return {
    user: userInfo().username,
    run: (command, args) =>
      new Promise((resolve) =>
        execFile(command, args, { timeout: 15_000, env: { ...process.env, LC_ALL: "C" } }, (error, stdout, stderr) => {
          const code = error === null ? 0 : "code" in error && typeof error.code === "number" ? error.code : 127;
          resolve({ code, stdout, stderr });
        }),
      ),
    read: (path) => readFile(path, "utf8").catch(() => null),
    list: (dir) => readdir(dir).catch(() => []),
    exists: (path) => access(path).then(() => true, () => false),
  };
}
