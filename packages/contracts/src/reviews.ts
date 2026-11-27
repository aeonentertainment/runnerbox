import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { GitHubAppName } from "./github.ts";
import { RepoName } from "./history.ts";

// Code review: the open pull requests on the repositories the owner picked, read through the
// server's sign-in to GitHub (github.ts), on the repositories the App is installed on.

// A repository the App is installed on, whether the owner turned reviews on for it, and whether a
// finished review is posted on its pull request. A server older than posting leaves `post` out.
export const ReviewRepo = Schema.Struct({ repo: RepoName, review: Schema.Boolean, post: Schema.optionalKey(Schema.Boolean) });
export type ReviewRepo = typeof ReviewRepo.Type;

// What the owner tells reviews beyond which repositories: which pull requests are reviewed unasked,
// which files are left out, how much the reviewer reports, and anything else it should know.
// Pressing Review ignores the first group. A server older than rules leaves them out of the view.
const Patterns = Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))).check(Schema.isMaxLength(50));
export const ReviewStrictness = Schema.Literals(["low", "medium", "high"]);
export type ReviewStrictness = typeof ReviewStrictness.Type;
export const ReviewRules = Schema.Struct({
  onPush: Schema.Boolean,
  drafts: Schema.Boolean,
  skipAuthors: Patterns,
  skipTitles: Patterns,
  skipLabels: Patterns,
  ignoreFiles: Patterns,
  strictness: ReviewStrictness,
  instructions: Schema.String.check(Schema.isMaxLength(2000)),
  // Rules added later fill in their default, so settings saved before them still read.
  inline: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
  status: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
});
export type ReviewRules = typeof ReviewRules.Type;
export const DEFAULT_REVIEW_RULES: ReviewRules = { onPush: true, drafts: false, skipAuthors: [], skipTitles: [], skipLabels: [], ignoreFiles: [], strictness: "medium", instructions: "", inline: true, status: true };
// A pattern list as clients edit it: one line, comma separated.
export const patternsText = (patterns: ReadonlyArray<string>) => patterns.join(", ");
export const patternsFromText = (text: string) => [...new Set(text.split(",").map((part) => part.trim().slice(0, 200)).filter((part) => part !== ""))].slice(0, 50);

export const RuleSkip = Schema.Literals(["author", "title", "label"]);
export type RuleSkip = typeof RuleSkip.Type;

export const PullNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000_000 }));

export const ReviewImpact = Schema.Literals(["low", "medium", "high", "critical"]);
export const ReviewPriority = Schema.Literals(["P1", "P2"]);

// One defect the reviewer verified. P1 should be fixed before merging; P2 is real but narrow.
export const ReviewFinding = Schema.Struct({
  priority: ReviewPriority,
  // The symptom as a person would see it, in a few words.
  title: Schema.String,
  path: Schema.String,
  startLine: Schema.Int,
  endLine: Schema.Int,
  body: Schema.String,
  // The line of the repository's AGENTS.md or CLAUDE.md it breaks, quoted.
  rule: Schema.NullOr(Schema.String),
  // The lines it points at, as they are at the reviewed commit. Empty when they couldn't be read.
  code: Schema.Array(Schema.Struct({ line: Schema.Int, text: Schema.String })),
});
export type ReviewFinding = typeof ReviewFinding.Type;

// `queued` waits for the review ahead of it. `stopped` is the owner's stop; `failed` says why in `problem`.
export const ReviewState = Schema.Literals(["queued", "running", "done", "failed", "stopped"]);
export type ReviewState = typeof ReviewState.Type;

// One review of one commit of a pull request. It's kept on the server, and posted on the pull
// request as one comment when the owner turned that on for the repository.
export const Review = Schema.Struct({
  id: Schema.String,
  repo: RepoName,
  number: Schema.Int,
  title: Schema.String,
  author: Schema.String,
  branch: Schema.String,
  base: Schema.String,
  headSha: Schema.String,
  additions: Schema.Int,
  deletions: Schema.Int,
  changedFiles: Schema.Int,
  state: ReviewState,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  model: Schema.String,
  costUsd: Schema.NullOr(Schema.Number),
  // How many different files the reviewer opened beyond the diff.
  filesRead: Schema.Int,
  // 5 is safe to merge with no findings, 1 should not merge. Null until the review is done.
  score: Schema.NullOr(Schema.Int),
  impact: Schema.NullOr(ReviewImpact),
  // What the change touches, and what to do before merging, a sentence each.
  reach: Schema.NullOr(Schema.String),
  verdict: Schema.NullOr(Schema.String),
  findings: Schema.Array(ReviewFinding),
  problem: Schema.NullOr(Schema.String),
  // The comment it was posted as on the pull request, when it was.
  comment: Schema.optionalKey(Schema.Struct({ id: Schema.Int, url: Schema.String })),
  // The findings it left on their lines, by priority, path and title, so a later review of the
  // same pull request doesn't leave the same one again.
  postedInline: Schema.optionalKey(Schema.Array(Schema.String)),
  // Why its status check couldn't be set on the reviewed commit, when posting is on.
  statusProblem: Schema.optionalKey(Schema.String),
  // Why it couldn't be posted, when posting is on and GitHub didn't take it.
  commentProblem: Schema.optionalKey(Schema.String),
});
export type Review = typeof Review.Type;

// The newest review of a pull request, as its row in the list shows it.
export const ReviewSummary = Schema.Struct({
  id: Schema.String,
  state: ReviewState,
  headSha: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Schema.Int),
  impact: Schema.NullOr(ReviewImpact),
  p1: Schema.Int,
  p2: Schema.Int,
});
export type ReviewSummary = typeof ReviewSummary.Type;

// A pull request's reviews, the newest first.
export const PullReviews = Schema.Struct({ reviews: Schema.Array(Review), canReview: Schema.Boolean });
export type PullReviews = typeof PullReviews.Type;

export const ReviewModel = Schema.Struct({ id: Schema.String, label: Schema.String });

// `waiting` is queued for a runner, or held by GitHub before it's given one.
export const CheckState = Schema.Literals(["passed", "failed", "running", "waiting", "skipped", "cancelled"]);
export type CheckState = typeof CheckState.Type;

// One job that ran, or will run, on a pull request's head commit: its newest attempt.
export const Check = Schema.Struct({
  name: Schema.String,
  workflow: Schema.NullOr(Schema.String),
  state: CheckState,
  startedAt: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(Schema.Number),
});
export type Check = typeof Check.Type;

export const PullRequest = Schema.Struct({
  repo: RepoName,
  number: Schema.Int,
  title: Schema.String,
  author: Schema.String,
  branch: Schema.String,
  base: Schema.String,
  headSha: Schema.String,
  draft: Schema.Boolean,
  openedAt: Schema.String,
  updatedAt: Schema.String,
  // Its newest review, when it has one. A server that can't review leaves it out.
  review: Schema.optionalKey(ReviewSummary),
  // Why it's never reviewed unasked: a draft, a bot's, or from a fork. Pressing Review still works.
  skipped: Schema.optionalKey(Schema.Literals(["draft", "bot", "fork"])),
  // Skipped by one of the owner's rules. A separate key, so an older client still reads the view.
  skippedBy: Schema.optionalKey(RuleSkip),
  // Its head commit's checks, from this machine's job history and GitHub. An older server leaves it out.
  checks: Schema.optionalKey(Schema.Array(Check)),
});
export type PullRequest = typeof PullRequest.Type;

export const ReviewsView = Schema.Struct({
  // The App reviews read through, or null until the server is signed in to GitHub.
  app: Schema.NullOr(GitHubAppName),
  repos: Schema.Array(ReviewRepo),
  // Open pull requests on the repositories with reviews on, the most recently changed first.
  pulls: Schema.Array(PullRequest),
  // Why the lists may be short or out of date, such as GitHub not answering.
  problem: Schema.NullOr(Schema.String),
  checkedAt: Schema.NullOr(Schema.String),
  // Whether this session may turn a repository on.
  canConfigure: Schema.Boolean,
  // Whether this session may start and stop reviews, which run on the owner's Claude account.
  canReview: Schema.optionalKey(Schema.Boolean),
  // The model reviews run on, and the ones to pick from.
  model: Schema.optionalKey(Schema.String),
  models: Schema.optionalKey(Schema.Array(ReviewModel)),
  // True once as many reviews as a day allows have started unasked. Pressing Review still works.
  autoPaused: Schema.optionalKey(Schema.Boolean),
  rules: Schema.optionalKey(ReviewRules),
});
export type ReviewsView = typeof ReviewsView.Type;

// What reviews found over a window, from the reviews the server keeps. Days are UTC dates.
export const ReviewInsightsDay = Schema.Struct({ day: Schema.String, first: Schema.Int, again: Schema.Int, p1: Schema.Int, p2: Schema.Int });
// One finding, counted once however many reviews of its pull request repeat it. `addressed` is
// whether a later review of the pull request stopped reporting it, or null before there is one.
export const CaughtFinding = Schema.Struct({
  priority: ReviewPriority,
  title: Schema.String,
  path: Schema.String,
  repo: RepoName,
  number: Schema.Int,
  pullTitle: Schema.String,
  foundAt: Schema.String,
  addressed: Schema.NullOr(Schema.Boolean),
});
export type CaughtFinding = typeof CaughtFinding.Type;
export const ReviewInsights = Schema.Struct({
  days: Schema.Array(ReviewInsightsDay),
  pulls: Schema.Int,
  reviews: Schema.Int,
  repos: Schema.Array(Schema.Struct({ repo: RepoName, reviews: Schema.Int, findings: Schema.Int })),
  // The newest first, at most a few hundred.
  findings: Schema.Array(CaughtFinding),
});
export type ReviewInsights = typeof ReviewInsights.Type;

// What the reviewer of a repository always keeps in mind: rules the owner wrote, or kept from a
// finding they said wasn't a problem. They're the owner's words, told to every review of it.
export const MemoryRuleText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500));
export const MemoryRule = Schema.Struct({ id: Schema.String.check(Schema.isMaxLength(40)), text: MemoryRuleText, addedAt: Schema.String });
export type MemoryRule = typeof MemoryRule.Type;
export const RepoMemory = Schema.Struct({ repo: RepoName, rules: Schema.Array(MemoryRule) });
export type RepoMemory = typeof RepoMemory.Type;
export const MAX_MEMORY_RULES = 100;

export class ReviewError extends Schema.TaggedError<ReviewError>()("ReviewError", {
  reason: Schema.Literals(["unreadable", "github_unreachable", "not_connected", "unknown_repo", "reviews_off", "pull_not_found", "review_running", "no_review", "provider_unavailable", "model_not_offered", "memory_full"]),
}) {
  override get message() {
    switch (this.reason) {
      case "unreadable":
        return "Couldn't read or write the review settings on the server.";
      case "github_unreachable":
        return "The server couldn't get an answer from GitHub. Try again in a minute.";
      case "not_connected":
        return "The server isn't signed in to GitHub. Sign in under Settings, GitHub.";
      case "unknown_repo":
        return "The App isn't installed on that repository.";
      case "reviews_off":
        return "Reviews are off for that repository. Turn them on in Settings, Reviews.";
      case "pull_not_found":
        return "That pull request isn't open, or the App can't see it.";
      case "review_running":
        return "A review of that pull request is already running.";
      case "no_review":
        return "No review of that pull request is running.";
      case "provider_unavailable":
        return "Claude Code isn't ready on the server's machine. Check Settings, Providers.";
      case "model_not_offered":
        return "Reviews can't run on that model.";
      case "memory_full":
        return "That repository already has as many rules as it can keep. Remove one first.";
    }
  }
}
