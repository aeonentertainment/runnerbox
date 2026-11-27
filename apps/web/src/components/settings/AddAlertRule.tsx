import { useAtomValue } from "@effect/atom-react";
import type { AlertKind, AlertRule } from "@runnerbox/contracts";
import { useState } from "react";
import { ALERT_KINDS, hasThreshold, THRESHOLD } from "../../lib/alertWords.ts";
import { reposEverywhereAtom } from "../../state/history.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select.tsx";

const ANY = "any";
const isKind = (value: unknown): value is AlertKind => ALERT_KINDS.some(([kind]) => kind === value);
const orNull = (text: string) => (text.trim() === "" ? null : text.trim());

// A new rule: what to watch for, and where. Empty fields match anything.
export function AddAlertRule({ onAdd }: { onAdd: (rule: AlertRule) => void }) {
  const repos = useAtomValue(reposEverywhereAtom);
  const [kind, setKind] = useState<AlertKind>("job_failed");
  const [repo, setRepo] = useState(ANY);
  const [branch, setBranch] = useState("");
  const [job, setJob] = useState("");
  const [threshold, setThreshold] = useState("");
  const add = () => {
    const count = Number.parseInt(threshold, 10);
    onAdd({
      id: crypto.randomUUID().slice(0, 12),
      kind,
      enabled: true,
      repo: repo === ANY ? null : repo,
      branch: kind === "review_p1" ? null : orNull(branch),
      job: kind === "review_p1" ? null : orNull(job),
      threshold: hasThreshold(kind) ? (Number.isInteger(count) && count >= 1 && count <= 1440 ? count : THRESHOLD[kind][1]) : null,
    });
    setBranch("");
    setJob("");
    setThreshold("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
      <Select value={kind} onValueChange={(next) => isKind(next) && setKind(next)}>
        <SelectTrigger size="sm" className="w-64" aria-label="When">
          <SelectValue>{(picked: AlertKind) => ALERT_KINDS.find(([value]) => value === picked)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {ALERT_KINDS.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {hasThreshold(kind) ? (
        <Input size="sm" type="number" min={1} max={1440} className="w-28" value={threshold} placeholder={`${THRESHOLD[kind][1]} ${THRESHOLD[kind][0]}`} aria-label={`How many ${THRESHOLD[kind][0]}`} onChange={(event) => setThreshold(event.target.value)} />
      ) : null}
      <Select value={repo} onValueChange={(next) => next && setRepo(next)}>
        <SelectTrigger size="sm" className="w-48" aria-label="Repository">
          <SelectValue>{(picked: string) => (picked === ANY ? "Any repository" : picked)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value={ANY}>Any repository</SelectItem>
          {repos.map((each) => (
            <SelectItem key={each} value={each}>
              {each}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {kind === "review_p1" ? null : (
        <>
          <Input size="sm" className="w-32" value={branch} maxLength={200} placeholder="any branch" aria-label="Branch" onChange={(event) => setBranch(event.target.value)} />
          <Input size="sm" className="w-36" value={job} maxLength={200} placeholder="any job" aria-label="Job name contains" onChange={(event) => setJob(event.target.value)} />
        </>
      )}
      <Button size="sm" variant="outline" onClick={add}>
        Add
      </Button>
    </div>
  );
}
