import type { ReviewFlowStep } from "@runnerbox/contracts";
import { ArrowRight } from "lucide-react";

type Chain = { readonly start: string; readonly steps: ReviewFlowStep[] };

// Steps run on from the part the last one reached; a step that starts elsewhere starts a new line.
const chainsOf = (flow: ReadonlyArray<ReviewFlowStep>) =>
  flow.reduce<Chain[]>((chains, step) => {
    const last = chains.at(-1);
    const reached = last?.steps.at(-1)?.to ?? last?.start;
    if (last !== undefined && reached === step.from) last.steps.push(step);
    else chains.push({ start: step.from, steps: [step] });
    return chains;
  }, []);

const Part = ({ name }: { name: string }) => <span className="rounded-md border px-2.5 py-1 text-xs">{name}</span>;

// How the change flows between parts of the system, as the reviewer read it: each part a box, each
// step an arrow with what it carries.
export function ReviewFlow({ flow }: { flow: ReadonlyArray<ReviewFlowStep> }) {
  return (
    <div className="flex flex-col gap-2">
      {chainsOf(flow).map((chain, index) => (
        <div key={index} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Part name={chain.start} />
          {chain.steps.map((step, at) => (
            <span key={at} className="contents">
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                {step.says}
                <ArrowRight className="size-3" />
              </span>
              <Part name={step.to} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
