import type { ReviewFinding } from "@runnerbox/contracts";
import { useState } from "react";
import { useReviewMemory } from "../../hooks/useReviewMemory.ts";
import { Button } from "../ui/button.tsx";
import { Textarea } from "../ui/textarea.tsx";

// A finding the owner says isn't a problem becomes a rule for the repository's reviewer, in words
// the owner reads and can change before keeping, since the finding's are the reviewer's.
export function NotAProblem({ environmentId, repo, finding }: { environmentId: string; repo: string; finding: ReviewFinding }) {
  const { available, remember } = useReviewMemory(environmentId);
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "kept" | string>("idle");
  if (!available) return null;
  if (state === "kept") return <p className="pt-1 text-muted-foreground text-xs">Kept. Later reviews of {repo} won't report it.</p>;
  if (draft === null) {
    return (
      <Button size="xs" variant="ghost-muted" className="mt-1 -ms-2" onClick={() => setDraft(`"${finding.title}" in ${finding.path} isn't a problem; don't report it.`)}>
        Not a problem
      </Button>
    );
  }
  return (
    <div className="mt-2 flex max-w-[680px] flex-col gap-2">
      <Textarea size="sm" value={draft} maxLength={500} aria-label="The rule to keep" onChange={(event) => setDraft(event.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          disabled={draft.trim() === ""}
          onClick={() =>
            void remember(repo, draft.trim()).then(
              () => setState("kept"),
              (cause: unknown) => setState(cause instanceof Error ? cause.message : "That didn't work."),
            )
          }
        >
          Keep as a rule
        </Button>
        <Button size="xs" variant="ghost-muted" onClick={() => setDraft(null)}>
          Cancel
        </Button>
        {state !== "idle" ? <span className="text-destructive text-xs">{state}</span> : null}
      </div>
    </div>
  );
}
