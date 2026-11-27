import { useAtomValue } from "@effect/atom-react";
import type { JobLogSection } from "@runnerbox/contracts";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { answerOf } from "../../lib/answer.ts";
import { cn } from "../../lib/utils.ts";
import { jobLogAtom } from "../../state/history.ts";
import { Input } from "../ui/input.tsx";

type Numbered = { readonly section: JobLogSection; readonly first: number };

function Lines({ lines, first, words }: { lines: JobLogSection["lines"]; first: number; words: string }) {
  const shown = lines.map((line, index) => ({ line, number: first + index })).filter(({ line }) => words === "" || line.text.toLowerCase().includes(words));
  return (
    <div className="overflow-x-auto py-1 font-mono text-xs leading-5">
      {shown.map(({ line, number }) => (
        <div key={number} className={cn("grid grid-cols-[4rem_minmax(0,1fr)] gap-3 whitespace-pre", line.error ? "text-destructive" : "text-muted-foreground")}>
          <span className="select-none text-right text-muted-foreground/50 tabular-nums">{number}</span>
          <span className="text-foreground/90">{line.text}</span>
        </div>
      ))}
    </div>
  );
}

// A failed section, and the last, start open: that's where a job tells why it ended.
function Section({ numbered, words, last }: { numbered: Numbered; words: string; last: boolean }) {
  const { section, first } = numbered;
  const [open, setOpen] = useState(section.failed || last);
  const matches = words === "" ? 0 : section.lines.filter((line) => line.text.toLowerCase().includes(words)).length;
  if (words !== "" && matches === 0) return null;
  const shown = open || words !== "";
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={shown} className="flex w-full items-center gap-2 py-1 text-left hover:text-foreground">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", shown && "rotate-90")} />
        <span className={cn("min-w-0 truncate", section.failed ? "text-destructive" : undefined)}>{section.title || "Output"}</span>
        <span className="ms-auto shrink-0 text-muted-foreground text-xs tabular-nums">{words === "" ? section.lines.length.toLocaleString() : `${matches} of ${section.lines.length.toLocaleString()}`}</span>
      </button>
      {shown ? <Lines lines={section.lines} first={first} words={words} /> : null}
    </div>
  );
}

function Log({ environmentId, repo, jobId }: { environmentId: string; repo: string; jobId: number }) {
  const log = answerOf(useAtomValue(jobLogAtom({ environmentId, repo, jobId })));
  const [query, setQuery] = useState("");
  if (log.error) return <p className="text-muted-foreground">{log.error instanceof Error ? log.error.message : "The log couldn't be read."}</p>;
  if (log.data === undefined) return <p className="text-muted-foreground">Reading the log from GitHub.</p>;
  const words = query.trim().toLowerCase();
  let next = 1;
  const numbered = log.data.sections.map((section) => {
    const first = next;
    next += section.lines.length;
    return { section, first };
  });
  return (
    <div className="flex flex-col gap-2">
      <Input type="search" size="sm" className="w-64" placeholder="Search the log" aria-label="Search the log" value={query} onChange={(event) => setQuery(event.target.value)} />
      {log.data.cut ? <p className="text-muted-foreground text-xs">The log is long, so only its end is here.</p> : null}
      <div className="flex flex-col">
        {numbered.map((each, index) => (
          <Section key={each.first} numbered={each} words={words} last={index === numbered.length - 1} />
        ))}
      </div>
    </div>
  );
}

// The job's log, read from GitHub only once asked for, since it can be long.
export function JobLogView({ environmentId, repo, jobId }: { environmentId: string; repo: string; jobId: number }) {
  const [shown, setShown] = useState(false);
  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)} className="text-foreground underline-offset-4 hover:underline">
        Show the log
      </button>
    );
  }
  return <Log environmentId={environmentId} repo={repo} jobId={jobId} />;
}
