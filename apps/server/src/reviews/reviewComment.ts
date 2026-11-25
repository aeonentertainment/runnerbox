import type { Review, ReviewFinding } from "@runnerbox/contracts";

// The comment a finished review leaves on its pull request, as Markdown. It's posted under the
// owner's own name, so nothing the reviewer wrote may act there: its words are data from a model
// that read code anyone could have written. They're shown as plain text, with no mention that
// would notify someone, no link or reference, and no markup of their own. Only this file's own
// structure, the link it builds to the reviewed lines, and the code excerpts in their fences are
// Markdown.

// GitHub refuses a comment longer than 65,536 characters.
const MAX_CHARS = 60_000;
const FOOTER = "Posted by RunnerBox";
// A zero-width space. GitHub turns names, addresses and numbers into links after Markdown is
// rendered, whatever was escaped, so each thing it looks for is broken in two with one of these.
const GAP = "​";

// Breaks what GitHub would link on its own: a mention (@name, @org/team, an email), an issue or
// pull request (#1, GH-1, owner/name#1), an address (anything://, www.), and a commit by its hash.
const unlinked = (text: string) =>
  text
    .replace(/@/g, `@${GAP}`)
    .replace(/#/g, `#${GAP}`)
    .replace(/\bGH-/gi, (found) => `${found}${GAP}`)
    .replace(/:\/\//g, `:${GAP}//`)
    .replace(/www\./gi, (found) => `${found.slice(0, 3)}${GAP}.`)
    .replace(/[0-9a-f]{7,}/gi, (found) => found.replace(/.{6}(?=.)/g, (six) => `${six}${GAP}`));

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

// For a Markdown paragraph: every ASCII punctuation character escaped, which Markdown allows for
// all of them, so none starts a link, emphasis, a list, a heading, a tag or anything else.
const asText = (text: string) => unlinked(oneLine(text)).replace(/[!-/:-@[-`{-~]/g, (character) => `\\${character}`);

// For inside this file's own HTML tags, where Markdown's escapes aren't read: everything but
// letters, digits and spaces as a character reference, so no tag or reference of the reviewer's survives.
const asHtml = (text: string) => unlinked(oneLine(text)).replace(/[^A-Za-z0-9 ​]/gu, (character) => `&#${character.codePointAt(0)};`);

// A fence longer than any run of backticks in what it holds, so the code can't close it.
const fenced = (lines: ReadonlyArray<string>) => {
  const longest = Math.max(2, ...lines.flatMap((line) => [...line.matchAll(/`+/g)].map((run) => run[0].length)));
  const fence = "`".repeat(longest + 1);
  return [fence, ...lines.map((line) => line.replace(/[\r\n]/g, " ")), fence].join("\n");
};

const lines = (finding: ReviewFinding) => (finding.startLine >= 1 ? `${finding.startLine}${finding.endLine > finding.startLine ? `-${finding.endLine}` : ""}` : "");

// The reviewed lines on GitHub, at the commit that was reviewed, so the link stays right after
// later pushes. The path is the reviewer's word, so it becomes a link only when it names a file
// plainly, each part of it percent-encoded so nothing in it can end the link or leave the commit.
const linesUrl = (site: string, review: Review, finding: ReviewFinding) => {
  const parts = finding.path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) return null;
  const path = parts.map((part) => encodeURIComponent(part).replace(/[!'()*~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
  const range = finding.startLine >= 1 ? `#L${finding.startLine}${finding.endLine > finding.startLine ? `-L${finding.endLine}` : ""}` : "";
  return `${site}/${review.repo}/blob/${review.headSha}/${path}${range}`;
};

const headline = (review: Review) => {
  const p1 = review.findings.filter((finding) => finding.priority === "P1").length;
  const p2 = review.findings.length - p1;
  if (p1 > 0) return `Fix ${p1} before merging`;
  if (p2 > 0) return p2 === 1 ? "1 thing to consider" : `${p2} things to consider`;
  return "No problems found";
};

const detail = (site: string, review: Review, finding: ReviewFinding) => {
  const url = linesUrl(site, review, finding);
  const where = asText(`${finding.path}${lines(finding) ? `:${lines(finding)}` : ""}`);
  return [
    `<details><summary><b>${finding.priority}</b> ${asHtml(finding.title)}</summary>`,
    "",
    url === null ? where : `[${where}](${url})`,
    "",
    ...finding.body.split(/\n{2,}/).flatMap((paragraph) => (oneLine(paragraph) === "" ? [] : [asText(paragraph), ""])),
    ...(finding.rule === null ? [] : [`Rule it breaks: ${asText(finding.rule)}`, ""]),
    ...(finding.code.length === 0 ? [] : [fenced(finding.code.map((line) => line.text)), ""]),
    "</details>",
  ].join("\n");
};

// `site` is where GitHub's pages are, which only a test changes.
export function reviewComment(review: Review, site = "https://github.com") {
  const head = [
    `### ${headline(review)}`,
    "",
    [review.score === null ? null : `Confidence ${review.score} of 5`, review.impact === null ? null : `${review.impact} impact`].filter((part) => part !== null).join(" · "),
    "",
    ...(review.reach === null ? [] : [asText(review.reach), ""]),
    ...(review.verdict === null ? [] : [asText(review.verdict), ""]),
  ];
  const foot = ["", `<sub>Reviewed commit <code>${review.headSha.slice(0, 7)}</code>. ${FOOTER}.</sub>`];
  const details: string[] = [];
  let used = [...head, ...foot].join("\n").length;
  let left = 0;
  // A finding too long to fit is left out, and the ones after it still get their chance.
  for (const finding of review.findings) {
    const next = detail(site, review, finding);
    if (used + next.length + 1 > MAX_CHARS) left += 1;
    else {
      details.push(next);
      used += next.length + 1;
    }
  }
  return [...head, ...details, ...(left > 0 ? ["", `${left} more ${left === 1 ? "finding is" : "findings are"} in RunnerBox, too long to show here.`] : []), ...foot].join("\n");
}
