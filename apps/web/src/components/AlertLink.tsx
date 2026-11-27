import type { FiredAlert } from "@runnerbox/contracts";
import { Link } from "@tanstack/react-router";
import type { RootSearch } from "../lib/search.ts";

const keep = (previous: RootSearch) => previous;

// Where a fired alert opens: its run, or its pull request.
export function AlertLink({ alert, className }: { alert: FiredAlert; className?: string }) {
  if (alert.subject._tag === "run") {
    return (
      <Link to="/runs/$jobId" params={{ jobId: String(alert.subject.jobId) }} search={(previous: RootSearch) => ({ ...previous, repo: alert.subject.repo })} className={className}>
        {alert.title}
      </Link>
    );
  }
  const [owner = "", name = ""] = alert.subject.repo.split("/");
  return (
    <Link to="/pulls/$owner/$name/$number" params={{ owner, name, number: String(alert.subject.number) }} search={keep} className={className}>
      {alert.title}
    </Link>
  );
}

