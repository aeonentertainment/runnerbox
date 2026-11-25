import type { DayTotals, PullRequest } from "@runnerbox/contracts";
import { addTotals } from "../../lib/addTotals.ts";
import { hasFindings } from "../../lib/pullStanding.ts";
import { ChartLegend } from "./ChartLegend.tsx";
import { DayAreas } from "./DayAreas.tsx";
import { OverviewSection } from "./OverviewSection.tsx";
import { RankedList } from "./RankedList.tsx";

// The open pull requests a review has finished on, per repository, and how many of them have
// something to fix. The daily totals aren't split by repository, so the list reads what's open now.
function byRepository(pulls: ReadonlyArray<PullRequest>) {
  const reviewed = pulls.filter((pull) => pull.review?.state === "done");
  return [...Map.groupBy(reviewed, (pull) => pull.repo)]
    .map(([repo, each]) => ({ repo, reviewed: each.length, fix: each.filter(hasFindings).length }))
    .toSorted((a, b) => b.reviewed - a.reviewed);
}

// Reviews that finished each day, split by whether they found something to fix.
export function ReviewsEachDay({ days, pulls, range }: { days: ReadonlyArray<DayTotals>; pulls: ReadonlyArray<PullRequest>; range: string }) {
  const total = addTotals(days);
  return (
    <OverviewSection title="Reviews each day" aside={`${total.reviews.toLocaleString()} ${range.toLowerCase()}`}>
      {total.reviews === 0 ? (
        <p className="text-muted-foreground">No reviews finished {range.toLowerCase()}.</p>
      ) : (
        <>
          <ChartLegend keys={[{ label: "Found something to fix", mark: "line", className: "bg-foreground" }, { label: "Found nothing", mark: "line", className: "bg-muted-foreground" }]} />
          <DayAreas
            days={days.map((day) => day.day)}
            series={[
              { label: "Found something to fix", color: "var(--foreground)", values: days.map((day) => day.reviewsWithFindings) },
              { label: "Found nothing", color: "var(--muted-foreground)", values: days.map((day) => day.reviews - day.reviewsWithFindings) },
            ]}
            label="Reviews each day, found something to fix and found nothing"
          />
        </>
      )}
      <RankedList
        heading="Open pull requests reviewed, by repository"
        rows={byRepository(pulls).map((row) => ({ key: row.repo, label: row.repo, value: `${row.reviewed} reviewed · ${row.fix} to fix` }))}
      />
    </OverviewSection>
  );
}
