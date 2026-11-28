import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { fixScript, type FixId } from "./fixes.ts";

type Input = Readable & { isTTY?: boolean };
type Run = { id: FixId; user: string; input: Input; sudoBinary?: string };

// Runs a fix's script as root and returns its exit code. In a terminal, sudo asks for the password
// itself. Otherwise, as over the app's SSH, the first line of stdin is the password: it goes to
// `sudo -S` on stdin and nowhere else, and an empty line means sudo needs none.
export async function runFix({ id, user, input, sudoBinary = "sudo" }: Run) {
  const script = fixScript(id, user);
  if (input.isTTY) return exitCode(spawn(sudoBinary, ["--", "bash", "-c", script], { stdio: "inherit" }));
  const password = await firstLine(input);
  const args = password === "" ? ["-n", "--", "bash", "-c", script] : ["-S", "-p", "", "--", "bash", "-c", script];
  const child = spawn(sudoBinary, args, { stdio: ["pipe", "inherit", "inherit"] });
  child.stdin.end(password === "" ? "" : `${password}\n`);
  return exitCode(child);
}

function firstLine(input: Input) {
  const lines = createInterface({ input });
  return new Promise<string>((resolve) => {
    // close() emits "close" at once, so resolve with the line first.
    lines.once("line", (line) => {
      resolve(line);
      lines.close();
    });
    lines.once("close", () => resolve(""));
  });
}

const exitCode = (child: ReturnType<typeof spawn>) =>
  new Promise<number>((resolve) => {
    child.once("error", () => resolve(127));
    child.once("exit", (code) => resolve(code ?? 1));
  });
