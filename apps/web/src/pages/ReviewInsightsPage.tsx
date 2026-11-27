import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { FindingsTable } from "../components/insights/FindingsTable.tsx";
import { ChartLegend } from "../components/overview/ChartLegend.tsx";
import { DayAreas } from "../components/overview/DayAreas.tsx";
import { OverviewSection } from "../components/overview/OverviewSection.tsx";
import { RankedList } from "../components/overview/RankedList.tsx";
import { Total } from "../components/overview/Total.tsx";
import { PageBar } from "../components/PageBar.tsx";
import { PageBody } from "../components/PageBody.tsx";
import { RangeMenu } from "../components/RangeMenu.tsx";
import { RANGE_WORDS } from "../components/rangeWords.ts";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useRange } from "../hooks/useRange.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { reviewInsightsAtom } from "../state/reviewInsights.ts";

// What reviews found over the range on the active machine: how many pull requests and reviews, the
// findings, and how many a later push fixed, then each finding.
export function ReviewInsightsPage() {
  const { environment } = useActiveEnvironment();
  const environmentId = environment?.environmentId ?? "";
  const { range, days } = useRange();
  const words = RANGE_WORDS[range];
  const available = useAtomValue(capabilitiesAtom(environmentId)).reviewInsights;
  const insights = Option.getOrNull(AsyncResult.value(useAtomValue(reviewInsightsAtom({ environmentId, days }))));
  const bar = (
    <PageBar title="Analytics">
      <RangeMenu />
    </PageBar>
  );
  if (!available) {
    return (
      <>
        {bar}
        <PageBody>
          <p className="text-muted-foreground">This server is older than review analytics. Update it under Settings, About.</p>
        </PageBody>
      </>
    );
  }
  if (insights === null) return bar;
  const p1 = insights.findings.filter((finding) => finding.priority === "P1").length;
  const decided = insights.findings.filter((finding) => finding.addressed !== null);
  const addressed = decided.filter((finding) => finding.addressed === true).length;
  const dayList = insights.days.map((day) => day.day);
  return (
    <>
      {bar}
      <PageBody width="expanded" className="@container gap-10">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-7 gap-y-5">
          <Total label="Pull requests reviewed" value={insights.pulls.toLocaleString()} under={null} />
          <Total label="Reviews" value={insights.reviews.toLocaleString()} under={insights.pulls > 0 ? `${(insights.reviews / insights.pulls).toFixed(1)} per pull request` : null} />
          <Total label="Bugs caught" value={insights.findings.length.toLocaleString()} under={insights.findings.length > 0 ? `${p1} P1, ${insights.findings.length - p1} P2` : null} />
          <Total
            label="Addressed"
            value={decided.length === 0 ? "-" : `${Math.round((addressed / decided.length) * 100)}%`}
            under={decided.length === 0 ? null : `${addressed} of ${decided.length} reviewed again`}
            why="Of the findings on pull requests reviewed again, the share a later review stopped reporting."
          />
        </div>
        <div className="grid gap-x-12 gap-y-11 @3xl:grid-cols-2">
          <OverviewSection title="Reviews each day" aside={`${insights.reviews.toLocaleString()} ${words.now.toLowerCase()}`}>
            {insights.reviews === 0 ? (
              <p className="text-muted-foreground">No reviews finished {words.now.toLowerCase()}.</p>
            ) : (
              <>
                <ChartLegend keys={[{ label: "First review", mark: "line", className: "bg-foreground" }, { label: "Reviewed again", mark: "line", className: "bg-muted-foreground" }]} />
                <DayAreas
                  days={dayList}
                  series={[
                    { label: "First review", color: "var(--foreground)", values: insights.days.map((day) => day.first) },
                    { label: "Reviewed again", color: "var(--muted-foreground)", values: insights.days.map((day) => day.again) },
                  ]}
                  label="Reviews each day, first reviews and reviews again"
                />
              </>
            )}
            <RankedList heading="Repositories by reviews" rows={insights.repos.slice(0, 5).map((row) => ({ key: row.repo, label: row.repo, value: row.reviews.toLocaleString() }))} />
          </OverviewSection>
          <OverviewSection title="Bugs caught each day" aside={`${insights.findings.length.toLocaleString()} ${words.now.toLowerCase()}`}>
            {insights.findings.length === 0 ? (
              <p className="text-muted-foreground">Reviews found nothing to fix {words.now.toLowerCase()}.</p>
            ) : (
              <>
                <ChartLegend keys={[{ label: "P1", mark: "line", className: "bg-warning" }, { label: "P2", mark: "line", className: "bg-muted-foreground" }]} />
                <DayAreas
                  days={dayList}
                  series={[
                    { label: "P1", color: "var(--warning)", values: insights.days.map((day) => day.p1) },
                    { label: "P2", color: "var(--muted-foreground)", values: insights.days.map((day) => day.p2) },
                  ]}
                  label="Findings each day, P1 and P2"
                />
              </>
            )}
            <RankedList
              heading="Repositories by bugs caught"
              rows={insights.repos
                .filter((row) => row.findings > 0)
                .toSorted((a, b) => b.findings - a.findings)
                .slice(0, 5)
                .map((row) => ({ key: row.repo, label: row.repo, value: row.findings.toLocaleString() }))}
            />
          </OverviewSection>
        </div>
        {insights.findings.length > 0 ? (
          <OverviewSection title="Findings">
            <FindingsTable findings={insights.findings} />
          </OverviewSection>
        ) : null}
      </PageBody>
    </>
  );
}
