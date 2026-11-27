import type { CaughtFinding, Review, ReviewFinding, ReviewInsights } from "@runnerbox/contracts";

const DAY_MS = 24 * 60 * 60_000;
const MAX_FINDINGS = 300;
const dateOf = (time: string | number) => new Date(time).toISOString().slice(0, 10);

// Two reviews report the same finding when it's in the same file and either keeps its title or
// sits within a few lines of where it was: a reviewer words the same defect differently from run
// to run, and a push moves lines.
const NEAR_LINES = 5;
const same = (a: ReviewFinding, b: ReviewFinding) => a.path === b.path && (a.title === b.title || Math.abs(a.startLine - b.startLine) <= NEAR_LINES);

// What finished reviews found in the last `days`, with each finding counted in the review that
// first reported it, and addressed once a later review of the pull request no longer does.
export function reviewInsights(all: ReadonlyArray<Review>, now: number, days: number): ReviewInsights {
  const since = now - days * DAY_MS;
  const done = all.filter((review) => review.state === "done").toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const byPull = Map.groupBy(done, (review) => `${review.repo}#${review.number}`);
  const findings: CaughtFinding[] = [];
  const firsts = new Set<string>();
  for (const reviews of byPull.values()) {
    const [first] = reviews;
    if (first !== undefined) firsts.add(first.id);
    reviews.forEach((review, index) => {
      const before = reviews[index - 1];
      for (const finding of review.findings) {
        if (before?.findings.some((earlier) => same(finding, earlier))) continue;
        let last = index;
        while (reviews[last + 1]?.findings.some((later) => same(finding, later))) last += 1;
        findings.push({
          priority: finding.priority,
          title: finding.title,
          path: finding.path,
          repo: review.repo,
          number: review.number,
          pullTitle: review.title,
          foundAt: review.startedAt,
          addressed: last + 1 < reviews.length ? true : index === reviews.length - 1 ? null : false,
        });
      }
    });
  }
  const inWindow = (time: string) => Date.parse(time) >= since;
  const reviewed = done.filter((review) => inWindow(review.startedAt));
  const caught = findings.filter((finding) => inWindow(finding.foundAt));
  const reviewsByDay = Map.groupBy(reviewed, (review) => dateOf(review.startedAt));
  const caughtByDay = Map.groupBy(caught, (finding) => dateOf(finding.foundAt));
  const repos = [...new Set(reviewed.map((review) => review.repo))].map((repo) => ({
    repo,
    reviews: reviewed.filter((review) => review.repo === repo).length,
    findings: caught.filter((finding) => finding.repo === repo).length,
  }));
  return {
    days: Array.from({ length: days + 1 }, (_, index) => dateOf(since + index * DAY_MS)).map((day) => {
      const reviews = reviewsByDay.get(day) ?? [];
      const found = caughtByDay.get(day) ?? [];
      return {
        day,
        first: reviews.filter((review) => firsts.has(review.id)).length,
        again: reviews.filter((review) => !firsts.has(review.id)).length,
        p1: found.filter((finding) => finding.priority === "P1").length,
        p2: found.filter((finding) => finding.priority === "P2").length,
      };
    }),
    pulls: new Set(reviewed.map((review) => `${review.repo}#${review.number}`)).size,
    reviews: reviewed.length,
    repos: repos.toSorted((a, b) => b.reviews - a.reviews),
    findings: caught.toSorted((a, b) => Date.parse(b.foundAt) - Date.parse(a.foundAt)).slice(0, MAX_FINDINGS),
  };
}
