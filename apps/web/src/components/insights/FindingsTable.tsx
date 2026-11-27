import type { CaughtFinding } from "@runnerbox/contracts";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { dayName } from "../../lib/chartScale.ts";
import type { RootSearch } from "../../lib/search.ts";
import { cn } from "../../lib/utils.ts";
import { Input } from "../ui/input.tsx";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.tsx";

const keep = (previous: RootSearch) => previous;
const PRIORITIES = [["all", "Any priority"], ["P1", "P1"], ["P2", "P2"]] as const;
const STATUSES = [["all", "Any status"], ["open", "Open"], ["addressed", "Addressed"]] as const;
type Priority = (typeof PRIORITIES)[number][0];
type Status = (typeof STATUSES)[number][0];

function Filter<K extends string>({ value, options, label, onChange }: { value: K; options: ReadonlyArray<readonly [K, string]>; label: string; onChange: (next: K) => void }) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger size="sm" className="w-40" aria-label={label}>
        <SelectValue>{(picked: K) => options.find(([key]) => key === picked)?.[1]}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

const statusOf = (finding: CaughtFinding) => (finding.addressed === true ? "addressed" : "open");

// Every finding the range caught, searchable by its words, file or pull request.
export function FindingsTable({ findings }: { findings: ReadonlyArray<CaughtFinding> }) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<Priority>("all");
  const [status, setStatus] = useState<Status>("all");
  const words = query.trim().toLowerCase();
  const shown = findings.filter(
    (finding) =>
      (priority === "all" || finding.priority === priority) &&
      (status === "all" || statusOf(finding) === status) &&
      (words === "" || [finding.title, finding.path, finding.repo, finding.pullTitle, `#${finding.number}`].some((text) => text.toLowerCase().includes(words))),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" size="sm" className="w-64" placeholder="Search findings" aria-label="Search findings" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Filter value={priority} options={PRIORITIES} label="Priority" onChange={setPriority} />
        <Filter value={status} options={STATUSES} label="Status" onChange={setStatus} />
        <span className="ms-auto text-muted-foreground text-xs">{shown.length === 1 ? "1 finding" : `${shown.length.toLocaleString()} findings`}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Priority</TableHead>
            <TableHead>Finding</TableHead>
            <TableHead>Pull request</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-24 text-right">Found</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((finding) => {
            const [owner = "", name = ""] = finding.repo.split("/");
            return (
              <TableRow key={`${finding.repo}#${finding.number}:${finding.path}:${finding.title}:${finding.foundAt}`}>
                <TableCell className={cn("font-medium", finding.priority === "P1" ? "text-warning" : "text-muted-foreground")}>{finding.priority}</TableCell>
                <TableCell className="max-w-0">
                  <div className="truncate">{finding.title}</div>
                  <div className="truncate font-mono text-muted-foreground text-xs">{finding.path}</div>
                </TableCell>
                <TableCell className="max-w-0">
                  <Link to="/pulls/$owner/$name/$number" params={{ owner, name, number: String(finding.number) }} search={keep} className="block truncate hover:text-foreground">
                    {finding.repo} #{finding.number}
                  </Link>
                </TableCell>
                <TableCell className={finding.addressed === true ? "text-muted-foreground" : undefined}>{finding.addressed === true ? "Addressed" : "Open"}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">{dayName(finding.foundAt.slice(0, 10))}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
