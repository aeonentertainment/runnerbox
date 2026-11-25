import type { Review, ReviewFinding } from "@runnerbox/contracts";

// The comment a finished review leaves on its pull request, as Markdown. It's posted under the
// owner's own name, so nothing the reviewer wrote may act there: its words are data from a model
// that read code anyone could have written. They're shown as plain text, with no mention that
// would notify someone, no link or reference of any kind, and no markup of their own. Only this file's own
// structure, the link it builds to the reviewed lines, and the code excerpts in their fences are
// Markdown.

// GitHub refuses a comment longer than 65,536 characters.
const MAX_CHARS = 60_000;
const FOOTER = "Posted by RunnerBox";
// A zero-width space. After Markdown is rendered, GitHub goes over the text and links what it
// recognises, whatever was escaped: names, issues and pull requests by number or by path,
// addresses, commit hashes, advisories, a repository's own ticket prefixes, and maths between
// dollar signs. Every one of those is letters and digits held together by punctuation, or a long
// run of hex digits. So rather than list them, one of these goes around every punctuation
// character, between a letter and a digit, and into any long run of hex digits, and nothing the
// reviewer wrote is left whole enough to recognise.
const GAP = "\u200b";
const PUNCTUATION = /[!-/:-@[-`{-~]/;
// GitHub links a commit by seven or more hex digits, so no run is left longer than six.
const HEX_RUN = 6;

// One line, with nothing invisible of the reviewer's own left in it: line breaks and tabs become
// spaces, and control and formatting characters go, among them the ones that reverse the reading
// order or hide text, and any gap the reviewer placed to line up with ours.
const clean = (text: string) => text.replace(/\s+/gu, " ").replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "").trim();

// The text with a gap wherever GitHub could otherwise recognise something, each character written
// by `write`, which escapes it for where the text is going.
const inert = (text: string, write: (character: string) => string) => {
  let out = "";
  let before: "letter" | "digit" | "other" = "other";
  let hex = 0;
  for (const character of clean(text)) {
    const kind = /\p{N}/u.test(character) ? "digit" : /\p{L}/u.test(character) ? "letter" : "other";
    hex = /[0-9a-f]/i.test(character) ? hex + 1 : 0;
    if (PUNCTUATION.test(character)) out += `${GAP}${write(character)}${GAP}`;
    else out += `${(kind !== "other" && before !== "other" && kind !== before) || (hex > HEX_RUN && (hex - 1) % HEX_RUN === 0) ? GAP : ""}${write(character)}`;
    before = kind;
  }
  return out;
};

// For a Markdown paragraph: every ASCII punctuation character escaped, which Markdown allows for
// all of them, so none starts a link, emphasis, a list, a heading, a tag or anything else.
const asText = (text: string) => inert(text, (character) => (PUNCTUATION.test(character) ? `\\${character}` : character));

// For inside this file's own HTML tags, where Markdown's escapes aren't read: everything but
// letters, digits and spaces as a character reference, so no tag or reference of the reviewer's survives.
const asHtml = (text: string) => inert(text, (character) => (/[A-Za-z0-9 ]/.test(character) ? character : `&#${character.codePointAt(0)};`));

// GitHub stops honouring a fence somewhere past 250 backticks, and the code after it would render
// as Markdown. So a run that long in the code is cut with a gap, and the fence stays short.
const LONGEST_RUN = 100;
// A line of the excerpt longer than this is cut, so one minified line can't crowd the rest out.
const LONGEST_LINE = 400;
// A fence longer than any run of backticks in what it holds, so the code can't close it. Each
// line stays one line, and keeps nothing that reverses or hides text.
const fenced = (lines: ReadonlyArray<string>) => {
  const shown = lines.map((line) => line.replace(/[\r\n\u2028\u2029\u0085]/g, " ").replace(/[\p{Cf}\p{Cs}]/gu, "").replace(new RegExp(`\`{${LONGEST_RUN}}(?=\`)`, "g"), (run) => `${run}${GAP}`)).map((line) => (line.length > LONGEST_LINE ? `${line.slice(0, LONGEST_LINE)}…` : line));
  const longest = Math.max(2, ...shown.flatMap((line) => [...line.matchAll(/`+/g)].map((run) => run[0].length)));
  const fence = "`".repeat(longest + 1);
  return [fence, ...shown, fence].join("\n");
};

// The lines a finding points at, when they're line numbers a file could have.
const MAX_LINE = 10_000_000;
const isLine = (line: number) => Number.isSafeInteger(line) && line >= 1 && line <= MAX_LINE;
const range = (finding: ReviewFinding, join: string, prefix = "") =>
  isLine(finding.startLine) ? `${prefix}${finding.startLine}${isLine(finding.endLine) && finding.endLine > finding.startLine ? `${join}${prefix}${finding.endLine}` : ""}` : "";

// The reviewed lines on GitHub, at the commit that was reviewed, so the link stays right after
// later pushes. The path is the reviewer's word, so it becomes a link only when it names a file
// plainly, each part of it percent-encoded so nothing in it can end the link or leave the commit.
const linesUrl = (site: string, review: Review, finding: ReviewFinding) => {
  // A path with half of a character pair in it can't be encoded at all.
  if (!finding.path.isWellFormed()) return null;
  const parts = finding.path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) return null;
  const path = parts.map((part) => encodeURIComponent(part).replace(/[!'()*~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
  const fragment = range(finding, "-", "L");
  return `${site}/${review.repo}/blob/${review.headSha}/${path}${fragment ? `#${fragment}` : ""}`;
};

const headline = (review: Review) => {
  const p1 = review.findings.filter((finding) => finding.priority === "P1").length;
  const p2 = review.findings.length - p1;
  if (p1 > 0) return `Fix ${p1} before merging`;
  if (p2 > 0) return p2 === 1 ? "1 thing to consider" : `${p2} things to consider`;
  return "No problems found";
};

// `withCode` leaves the excerpt out, for a finding that wouldn't fit with it.
const detail = (site: string, review: Review, finding: ReviewFinding, withCode: boolean) => {
  const url = linesUrl(site, review, finding);
  const where = asText(`${finding.path}${range(finding, "-") ? `:${range(finding, "-")}` : ""}`);
  return [
    `<details><summary><b>${finding.priority}</b> ${asHtml(finding.title)}</summary>`,
    "",
    url === null ? where : `[${where}](${url})`,
    "",
    ...finding.body.split(/\n{2,}/).flatMap((paragraph) => (clean(paragraph) === "" ? [] : [asText(paragraph), ""])),
    ...(finding.rule === null ? [] : [`Rule it breaks: ${asText(finding.rule)}`, ""]),
    ...(!withCode || finding.code.length === 0 ? [] : [fenced(finding.code.map((line) => line.text)), ""]),
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
  // A finding that doesn't fit is shown without its code, and left out only if that doesn't fit
  // either. The ones after it still get their chance.
  for (const finding of review.findings) {
    const next = [true, false].map((withCode) => detail(site, review, finding, withCode)).find((each) => used + each.length + 1 <= MAX_CHARS);
    if (next === undefined) left += 1;
    else {
      details.push(next);
      used += next.length + 1;
    }
  }
  return [...head, ...details, ...(left > 0 ? ["", `${left} more ${left === 1 ? "finding is" : "findings are"} in RunnerBox, too long to show here.`] : []), ...foot].join("\n");
}
