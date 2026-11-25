import type { Review, ReviewFinding } from "@runnerbox/contracts";

// The comment a finished review leaves on its pull request, as Markdown. It's posted under the
// owner's own name, so nothing the reviewer wrote may act there: its words are data from a model
// that read code anyone could have written. They're shown as plain text, with no mention that
// would notify someone, no link, and no markup of their own. Only this file's own structure, the
// links it builds to the reviewed lines, and the code excerpts in their fences are Markdown.

// GitHub refuses a comment longer than 65,536 characters.
const MAX_CHARS = 60_000;
const FOOTER = "Posted by RunnerBox";

// Every character Markdown or HTML gives a meaning to, escaped, so the text reads as it was written.
// A zero-width space after "@" and inside "://" stops GitHub turning a name into a mention that
// notifies, or an address into a link, which no escape does.
const plain = (text: string) =>
  text
    .replace(/[\\`*_{}[\]()#+!|<>~&-]/g, (character) => `\\${character}`)
    .replace(/@/g, "@​")
    .replace(/:\/\//g, ":​//")
    .replace(/\bwww\./gi, "www​.");

const oneLine = (text: string) => plain(text.replace(/\s+/g, " ").trim());

// A fence longer than any run of backticks in what it holds, so the code can't close it.
const fenced = (lines: ReadonlyArray<string>) => {
  const longest = Math.max(2, ...lines.flatMap((line) => [...line.matchAll(/`+/g)].map((run) => run[0].length)));
  const fence = "`".repeat(longest + 1);
  return [fence, ...lines, fence].join("\n");
};

// The reviewed lines on GitHub, at the commit that was reviewed, so the link stays right after later pushes.
const linesUrl = (site: string, review: Review, finding: ReviewFinding) =>
  `${site}/${review.repo}/blob/${review.headSha}/${finding.path.split("/").map(encodeURIComponent).join("/")}#L${finding.startLine}${finding.endLine > finding.startLine ? `-L${finding.endLine}` : ""}`;

const where = (finding: ReviewFinding) => `${finding.path}:${finding.startLine}${finding.endLine > finding.startLine ? `-${finding.endLine}` : ""}`;

const headline = (review: Review) => {
  const p1 = review.findings.filter((finding) => finding.priority === "P1").length;
  const p2 = review.findings.length - p1;
  if (p1 > 0) return `Fix ${p1} before merging`;
  if (p2 > 0) return p2 === 1 ? "1 thing to consider" : `${p2} things to consider`;
  return "No problems found";
};

const detail = (site: string, review: Review, finding: ReviewFinding) =>
  [
    `<details><summary><b>${finding.priority}</b> ${oneLine(finding.title)}</summary>`,
    "",
    `[${plain(where(finding))}](${linesUrl(site, review, finding)})`,
    "",
    ...finding.body.split(/\n{2,}/).flatMap((paragraph) => [oneLine(paragraph), ""]),
    ...(finding.rule === null ? [] : [`Rule it breaks: ${oneLine(finding.rule)}`, ""]),
    ...(finding.code.length === 0 ? [] : [fenced(finding.code.map((line) => line.text)), ""]),
    "</details>",
  ].join("\n");

// `site` is where GitHub's pages are, which only a test changes.
export function reviewComment(review: Review, site = "https://github.com") {
  const head = [
    `### ${headline(review)}`,
    "",
    [review.score === null ? null : `Confidence ${review.score} of 5`, review.impact === null ? null : `${review.impact} impact`].filter((part) => part !== null).join(" · "),
    "",
    ...(review.reach === null ? [] : [oneLine(review.reach), ""]),
    ...(review.verdict === null ? [] : [oneLine(review.verdict), ""]),
  ];
  const foot = ["", `<sub>Reviewed commit <code>${review.headSha.slice(0, 7)}</code>. ${FOOTER}.</sub>`];
  const details: string[] = [];
  let used = [...head, ...foot].join("\n").length;
  let left = 0;
  for (const [index, finding] of review.findings.entries()) {
    const next = detail(site, review, finding);
    if (used + next.length + 1 > MAX_CHARS) {
      left = review.findings.length - index;
      break;
    }
    details.push(next);
    used += next.length + 1;
  }
  return [...head, ...details, ...(left > 0 ? ["", `${left} more ${left === 1 ? "finding is" : "findings are"} in RunnerBox, too long to show here.`] : []), ...foot].join("\n");
}
