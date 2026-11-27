// The lines of each file GitHub lets a review comment sit on: those its diff shows on the new side,
// added or unchanged, by hunk, since a comment over several lines must stay inside one hunk.
export function commentableLines(diff: string) {
  const files = new Map<string, Array<ReadonlySet<number>>>();
  for (const part of diff.split(/^(?=diff --git )/m)) {
    const path = /^\+\+\+ b\/(.+)$/m.exec(part)?.[1];
    if (path === undefined) continue;
    const hunks: Array<Set<number>> = [];
    let line = 0;
    for (const text of part.split("\n")) {
      const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (header) {
        line = Number(header[1]);
        hunks.push(new Set());
      } else if (hunks.length > 0 && (text.startsWith("+") || text.startsWith(" "))) {
        hunks.at(-1)?.add(line);
        line += 1;
      }
    }
    files.set(path, hunks);
  }
  return files;
}

// Where a finding's comment goes: over its whole range when one hunk holds it, else on its last
// line or its first, whichever the diff shows. Null when the diff shows neither.
export function anchorOf(finding: { readonly startLine: number; readonly endLine: number }, hunks: ReadonlyArray<ReadonlySet<number>> | undefined) {
  if (hunks === undefined) return null;
  const [from, to] = finding.startLine <= finding.endLine ? [finding.startLine, finding.endLine] : [finding.endLine, finding.startLine];
  const shown = (line: number) => hunks.some((hunk) => hunk.has(line));
  if (from !== to && hunks.some((hunk) => hunk.has(from) && hunk.has(to))) return { start_line: from, line: to };
  if (shown(to)) return { line: to };
  if (shown(from)) return { line: from };
  return null;
}
