import type { JobLog, JobLogSection } from "@runnerbox/contracts";

type Building = { title: string; lines: Array<JobLogSection["lines"][number]>; failed: boolean };

// A log longer than this keeps its end, where a job fails.
export const MAX_LINES = 20_000;
const LINE_CHARS = 2_000;
// GitHub starts every line with when it was written.
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/;
// Colours and cursor moves a job printed, which a browser would show as noise.
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g;

// A job's log as GitHub sends it, cut to its end and split at the groups the job opened.
export function parseJobLog(text: string): JobLog {
  const all = text.split(/\r?\n/);
  if (all.at(-1) === "") all.pop();
  const cut = all.length > MAX_LINES;
  const sections: Building[] = [];
  let current: Building = { title: "", lines: [], failed: false };
  const close = () => {
    if (current.lines.length > 0 || current.title !== "") sections.push(current);
  };
  for (const raw of cut ? all.slice(-MAX_LINES) : all) {
    const line = raw.replace(STAMP, "").replace(ANSI, "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
    if (line.startsWith("##[group]")) {
      close();
      current = { title: line.slice("##[group]".length).slice(0, LINE_CHARS), lines: [], failed: false };
    } else if (line.startsWith("##[endgroup]")) {
      close();
      current = { title: "", lines: [], failed: false };
    } else if (line.startsWith("##[error]")) {
      current.lines.push({ text: line.slice("##[error]".length).slice(0, LINE_CHARS), error: true });
      current.failed = true;
    } else {
      current.lines.push({ text: line.slice(0, LINE_CHARS) });
    }
  }
  close();
  return { sections, cut };
}
