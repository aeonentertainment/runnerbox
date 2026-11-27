import { useState } from "react";
import { runtime } from "../../runtime.ts";
import { Button } from "../ui/button.tsx";

type State = { readonly kind: "idle" | "asking" | "started" } | { readonly kind: "failed"; readonly why: string };

// Runs the job again on GitHub. It shows under Runs once a runner picks it up.
export function RerunButton({ environmentId, repo, jobId }: { environmentId: string; repo: string; jobId: number }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const rerun = () => {
    setState({ kind: "asking" });
    runtime.run(environmentId, (client) => client["history.rerunJob"]({ repo, jobId })).then(
      () => setState({ kind: "started" }),
      (cause: unknown) => setState({ kind: "failed", why: cause instanceof Error ? cause.message : "GitHub didn't take the rerun." }),
    );
  };
  return (
    <span className="flex min-w-0 items-center gap-2">
      {state.kind === "failed" ? <span className="truncate text-destructive text-xs" title={state.why}>{state.why}</span> : null}
      {state.kind === "started" ? <span className="text-muted-foreground text-xs">Rerun started</span> : null}
      <Button size="xs" variant="outline" disabled={state.kind === "asking" || state.kind === "started"} onClick={rerun}>
        Rerun
      </Button>
    </span>
  );
}
