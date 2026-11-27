import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { PageBar } from "../components/PageBar.tsx";
import { PageBody } from "../components/PageBody.tsx";
import { RangeMenu } from "../components/RangeMenu.tsx";
import { RANGE_WORDS } from "../components/rangeWords.ts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.tsx";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useRange } from "../hooks/useRange.ts";
import { formatAge } from "../lib/format.ts";
import type { RootSearch } from "../lib/search.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { flakyTestsAtom } from "../state/flakyTests.ts";

// Tests that failed in an attempt that then passed when retried: the ones that make CI red for no
// reason, with how many runs each did it in.
export function FlakyTestsPage() {
  const environmentId = useActiveEnvironment().environment?.environmentId ?? "";
  const { range, days } = useRange();
  const available = useAtomValue(capabilitiesAtom(environmentId)).flakyTests;
  const view = Option.getOrNull(AsyncResult.value(useAtomValue(flakyTestsAtom({ environmentId, days }))));
  const words = RANGE_WORDS[range].now.toLowerCase();
  const bar = (
    <PageBar title="Flaky tests">
      <RangeMenu />
    </PageBar>
  );
  if (!available) {
    return (
      <>
        {bar}
        <PageBody>
          <p className="text-muted-foreground">This server is older than flaky tests. Update it under Settings, About.</p>
        </PageBody>
      </>
    );
  }
  if (view === null) return bar;
  return (
    <>
      {bar}
      <PageBody width="expanded" className="gap-4">
        <p className="text-muted-foreground">
          {view.flakyJobs === 0
            ? `No job failed and then passed when retried ${words}.`
            : `${view.flakyJobs} ${view.flakyJobs === 1 ? "job" : "jobs"} failed and then passed when retried ${words}. These are the tests their logs say failed.${view.unread > 0 ? ` Reading ${view.unread} more ${view.unread === 1 ? "log" : "logs"} from GitHub.` : ""}`}
        </p>
        {view.tests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="w-24 text-right">Flaked</TableHead>
                <TableHead className="w-24 text-right">Last</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.tests.map((test) => (
                <TableRow key={`${test.repo}\n${test.job}\n${test.test}`}>
                  <TableCell className="max-w-0">
                    <div className="truncate font-mono text-xs">{test.test}</div>
                    <div className="truncate text-muted-foreground text-xs">{test.repo}</div>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <Link
                      to="/runs/$jobId"
                      params={{ jobId: String(test.jobIds[0] ?? 0) }}
                      search={(previous: RootSearch) => ({ ...previous, repo: test.repo })}
                      className="block truncate hover:text-foreground"
                    >
                      {test.job}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{test.flakes === 1 ? "once" : `${test.flakes} times`}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatAge(test.lastAt)} ago</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </PageBody>
    </>
  );
}
