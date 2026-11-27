import { join } from "node:path";
import { BUILT_IN_ACCOUNT_ID, type PullReviews, type Review, ReviewError, type ReviewRules } from "@runnerbox/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as AccountStore from "../accounts/AccountStore.ts";
import * as AuthStore from "../auth/AuthStore.ts";
import { newId } from "../auth/secrets.ts";
import * as LocalEndpoint from "../config/LocalEndpoint.ts";
import * as ServerPaths from "../config/ServerPaths.ts";
import * as GitHub from "../github/GitHub.ts";
import { githubRequest } from "../github/githubRequest.ts";
import type { SubmittedReview } from "../mcp/reviewTool.ts";
import { QueueConfig } from "../runners/QueueConfig.ts";
import { Drivers } from "../threads/provider/Drivers.ts";
import type { TurnAccount } from "../threads/provider/ProviderAdapter.ts";
import { type FileLines, fetchCommits, type GitResult, type Listed, listPaths, type Matches, MAX_READ_LINES, readLines, searchLines } from "./gitObjects.ts";
import { pullDiff } from "./pullDiff.ts";
import { type PullToReview, pullToReview } from "./pullRequests.ts";
import { reviewableDiff } from "./reviewableDiff.ts";
import { findingComment, reviewComment } from "./reviewComment.ts";
import { anchorOf, commentableLines } from "./diffLines.ts";
import { matchesAny } from "./pathPatterns.ts";
import { reviewPrompt, reviewSystemPrompt } from "./reviewPrompt.ts";
import * as Reviews from "./Reviews.ts";
import * as ReviewMemory from "./ReviewMemory.ts";
import * as ReviewStore from "./ReviewStore.ts";

// Runs a review: fetches the pull request's head commit into a bare repository on this machine,
// gives a Claude turn the diff and tools that read that commit, and keeps what it hands in. The
// agent gets no checkout, no shell and none of runnerbox's other tools. A finished review is posted
// on the pull request as one comment, under the owner's sign-in, on a repository the owner turned
// that on for; the agent never writes to GitHub itself. One review runs at a time; the rest wait
// their turn.

const GITHUB_GIT = "https://github.com";
// More than this is too much to review well in one pass, and the review says so instead. Lockfiles
// and generated files don't count. The diff's size is bounded too, so it fits beside the code the
// reviewer has to read.
const MAX_CHANGED_LINES = 3000;
const MAX_DIFF_CHARS = 300_000;
const TOO_LARGE = "This pull request changes more than 3,000 lines outside lockfiles and generated files, which is too much to review well.";
const REVIEW_LIMIT = "20 minutes";
// The turn's MCP token is revoked when the review ends. This only bounds one a crash left behind.
const TOKEN_TTL_MS = 30 * 60_000;
const EXCERPT_LINES = 40;

class ReviewFailed extends Schema.TaggedError<ReviewFailed>()("ReviewFailed", { why: Schema.String }) {}
export type ToolRefused = { readonly message: string };

// What a review's turn may read, and what it handed in.
type Reading = { readonly dir: string; readonly commit: string; readonly opened: Set<string>; submitted: SubmittedReview | null };
// `checked` holds the token a pending status check was set with, so however the review ends its
// check is settled and never left pending on the commit.
type Run = { review: Review; stopped: boolean; fiber?: Fiber.Fiber<void, unknown>; checked: string | null };

export class ReviewRuns extends Context.Service<
  ReviewRuns,
  {
    readonly read: (repo: string, number: number, canReview: boolean) => Effect.Effect<PullReviews, ReviewError>;
    // Checks the pull request can be reviewed, records the review and returns it; the work goes on
    // in the background and ends in the store.
    readonly start: (repo: string, number: number) => Effect.Effect<Review, ReviewError>;
    // Returns once the review has ended and that's kept.
    readonly stop: (repo: string, number: number) => Effect.Effect<Review, ReviewError>;
    // The agent's tools, for the review its turn's token is bound to.
    readonly readFile: (sessionId: string, path: string, from: number | undefined, to: number | undefined) => Effect.Effect<FileLines, ToolRefused>;
    readonly search: (sessionId: string, pattern: string, options: { readonly glob?: string | undefined; readonly ignoreCase?: boolean | undefined }) => Effect.Effect<Matches, ToolRefused>;
    readonly listFiles: (sessionId: string, glob: string | undefined) => Effect.Effect<Listed, ToolRefused>;
    readonly submit: (sessionId: string, review: SubmittedReview) => Effect.Effect<void, ToolRefused>;
  }
>()("runnerbox/server/reviews/ReviewRuns") {}

const nowIso = Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms).toISOString()));

const make = Effect.gen(function* () {
  const { serverDir } = yield* ServerPaths.ServerPaths;
  const config = yield* QueueConfig;
  const github = yield* GitHub.GitHub;
  const reach = github.reach.pipe(Effect.mapError(Reviews.withoutGitHub));
  const reviews = yield* Reviews.Reviews;
  const store = yield* ReviewStore.ReviewStore;
  const memory = yield* ReviewMemory.ReviewMemory;
  const accounts = yield* AccountStore.AccountStore;
  const auth = yield* AuthStore.AuthStore;
  const endpoint = yield* LocalEndpoint.LocalEndpoint;
  const claude = (yield* Drivers).get("claude");
  const scope = yield* Effect.scope;
  const gitBase = config.gitBase ?? GITHUB_GIT;
  // `repo` has passed RepoName, so its two parts are safe as directory names.
  const codeDir = (repo: string) => join(serverDir, "review-code", ...repo.split("/"));
  const keyOf = (repo: string, number: number) => `${repo}#${number}`;

  const runs = new Map<string, Run>();
  const readings = new Map<string, Reading>();
  const lock = yield* Semaphore.make(1);
  const oneAtATime = yield* Semaphore.make(1);

  const keep = (run: Run, change: Partial<Review>) =>
    Effect.suspend(() => {
      run.review = { ...run.review, ...change };
      return store.put(run.review);
    });

  // A review runs on a Claude account: the owner's default when it is one, else Runnerbox's own login.
  const reviewer = Effect.gen(function* () {
    const preferred = yield* accounts.resolve(undefined);
    return preferred.driver === "claude" ? preferred : yield* accounts.resolve(BUILT_IN_ACCOUNT_ID);
  }).pipe(Effect.mapError(() => new ReviewError({ reason: "unreadable" })));

  const gitFailure = <A>(result: GitResult<A>): Effect.Effect<A, ReviewFailed> => (result.ok ? Effect.succeed(result.value) : Effect.fail(new ReviewFailed({ why: result.why })));

  const decodeComment = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.Int, html_url: Schema.String }));
  const COULD_NOT_POST = "This review couldn't be posted on the pull request. The next one tries again.";
  // The status check a review sets on the commit it reviewed, which a branch rule can require.
  const STATUS_CONTEXT = "RunnerBox review";
  const STATUS_REFUSED = "GitHub didn't take the status check. The GitHub App needs Commit statuses: Read and write.";
  const setStatus = (review: Review, token: string, state: "pending" | "success" | "failure" | "error", description: string) =>
    Effect.promise(() =>
      githubRequest(config.apiBase, "POST", `repos/${review.repo}/statuses/${review.headSha}`, token, {
        state,
        context: STATUS_CONTEXT,
        description: description.slice(0, 140),
        ...(review.comment ? { target_url: review.comment.url } : {}),
      }),
    );
  // What the finished review's check says: failing while there's a P1 to fix.
  const settleStatus = (review: Review, token: string) => {
    const p1 = review.findings.filter((finding) => finding.priority === "P1").length;
    const confidence = review.score === null ? "" : `, confidence ${review.score} of 5`;
    return setStatus(review, token, p1 > 0 ? "failure" : "success", `${p1 > 0 ? `Fix ${p1} before merging` : "Nothing to fix before merging"}${confidence}`);
  };

  const COULD_NOT_POST_INLINE = "This review's comments on the changed lines couldn't be posted. The next review tries again.";

  // Leaves each finding on the lines it points at, as one GitHub review, when the diff shows them.
  // A finding an earlier review of this pull request already left there isn't left again.
  const postInline = Effect.fn("ReviewRuns.postInline")(function* (run: Run, token: string, lines: ReturnType<typeof commentableLines>) {
    const { repo, number, headSha, findings } = run.review;
    const earlier = new Set((yield* store.list(repo, number)).filter((each) => each.id !== run.review.id).flatMap((each) => each.postedInline ?? []));
    const placed = yield* Effect.try(() =>
      findings.flatMap((finding) => {
        const key = `${finding.priority}\n${finding.path}\n${finding.title}`;
        const anchor = earlier.has(key) ? null : anchorOf(finding, lines.get(finding.path));
        if (anchor === null) return [];
        const where = "start_line" in anchor ? { ...anchor, start_side: "RIGHT" } : anchor;
        return [{ key, comment: { path: finding.path, side: "RIGHT", ...where, body: findingComment(finding) } }];
      }),
    );
    if (placed.length === 0) return {};
    const count = placed.length === 1 ? "1 finding" : `${placed.length} findings`;
    const body = { commit_id: headSha, event: "COMMENT", body: `${count} on the changed lines. <sub>Posted by RunnerBox.</sub>`, comments: placed.map(({ comment }) => comment) };
    const reply = yield* Effect.promise(() => githubRequest(config.apiBase, "POST", `repos/${repo}/pulls/${number}/reviews`, token, body));
    return reply.kind === "ok" ? { postedInline: placed.map(({ key }) => key) } : { commentProblem: COULD_NOT_POST_INLINE };
  });

  // Leaves the finished review on its pull request as one comment: the comment the pull request's
  // last posted review left is rewritten, so a pull request holds one, and a new one is made when
  // there's none or it was deleted. A review that can't be posted is still done, and says why.
  const postComments = Effect.fn("ReviewRuns.postComments")(function* (run: Run, token: string, lines: ReturnType<typeof commentableLines>, rules: ReviewRules) {
    const { repo, number } = run.review;
    // Building the comment is the one step here that runs over the reviewer's own words, so
    // anything it throws is a comment that couldn't be posted, not a review that failed.
    const body = { body: yield* Effect.try(() => reviewComment(run.review)) };
    const earlier = (yield* store.list(repo, number)).find((each) => each.id !== run.review.id && each.comment !== undefined)?.comment;
    const rewritten = earlier === undefined ? null : yield* Effect.promise(() => githubRequest(config.apiBase, "PATCH", `repos/${repo}/issues/comments/${earlier.id}`, token, body));
    // A comment that's gone, or that this sign-in may not rewrite, such as one left by whoever was
    // signed in before, is replaced by a new one. GitHub not answering, or not taking the token, is
    // told, not answered with a second comment.
    // GitHub also answers 403 when it's asked too often, which a second comment wouldn't help, so
    // a 403 counts as "may not rewrite" only when the comment can still be read.
    const readable = rewritten !== null && rewritten.kind === "error" && rewritten.status === 403 && earlier !== undefined ? (yield* Effect.promise(() => githubRequest(config.apiBase, "GET", `repos/${repo}/issues/comments/${earlier.id}`, token))).kind === "ok" : false;
    const replace = rewritten !== null && (rewritten.kind === "refused" ? rewritten.status === 404 : rewritten.kind === "error" && (readable || rewritten.status === 410 || rewritten.status === 422));
    const reply = rewritten === null || replace ? yield* Effect.promise(() => githubRequest(config.apiBase, "POST", `repos/${repo}/issues/${number}/comments`, token, body)) : rewritten;
    const posted = reply.kind === "ok" ? decodeComment(reply.body) : Option.none();
    if (Option.isNone(posted)) return { commentProblem: COULD_NOT_POST };
    // Only after the summary, which the lines' comments read as part of.
    const inline = rules.inline ? yield* postInline(run, token, lines).pipe(Effect.orElseSucceed(() => ({ commentProblem: COULD_NOT_POST_INLINE }))) : {};
    return { comment: { id: posted.value.id, url: posted.value.html_url }, ...inline };
  });

  // The comments, where posting is on, then the status check, which links to the summary. Kept in
  // one write, so whoever reads the review once it says it was posted sees all of it.
  const post = Effect.fn("ReviewRuns.post")(function* (run: Run, token: string, lines: ReturnType<typeof commentableLines>) {
    const settings = yield* reviews.settings;
    const posted: Partial<Review> = settings.post.includes(run.review.repo) ? yield* postComments(run, token, lines, settings.rules).pipe(Effect.orElseSucceed(() => ({ commentProblem: COULD_NOT_POST }))) : {};
    const checked = run.checked;
    const settled = checked === null ? null : yield* settleStatus({ ...run.review, ...posted }, checked);
    run.checked = null;
    yield* keep(run, { ...posted, ...(settled !== null && settled.kind !== "ok" ? { statusProblem: STATUS_REFUSED } : {}) });
  });

  // The lines a finding points at, as the owner will see them. A path or range the agent got wrong leaves it without.
  const excerpt = (reading: Reading, finding: SubmittedReview["findings"][number]) => {
    const [from, to] = finding.startLine <= finding.endLine ? [finding.startLine, finding.endLine] : [finding.endLine, finding.startLine];
    return Effect.promise((signal) => readLines(reading.dir, reading.commit, finding.path, from, Math.min(to, from + EXCERPT_LINES - 1), signal)).pipe(
      Effect.map((read) => ({ ...finding, startLine: from, endLine: to, code: read.ok ? read.value.lines : [] })),
    );
  };

  const work = (run: Run, pull: PullToReview, account: TurnAccount, rules: ReviewRules) =>
    Effect.gen(function* () {
      yield* keep(run, { state: "running" });
      // Asked for now, not when the review was asked for: a review that waited its turn would find an older token expired.
      const reached = yield* reach;
      if (reached === null) return yield* new ReviewError({ reason: "not_connected" });
      if (!reached.repos.includes(pull.repo)) return yield* new ReviewError({ reason: reached.problem === null ? "unknown_repo" : "github_unreachable" });
      const { token } = reached;
      const posting = yield* reviews.settings;
      if (posting.post.includes(pull.repo) && posting.rules.status) {
        const pending = yield* setStatus(run.review, token, "pending", "Reviewing");
        if (pending.kind === "ok") run.checked = token;
        else yield* keep(run, { statusProblem: STATUS_REFUSED });
      }
      const dir = codeDir(pull.repo);
      // Stopping the review ends git too, so it never outlives the review holding the repository's locks or the token.
      yield* Effect.promise((signal) => fetchCommits(dir, `${gitBase}/${pull.repo}.git`, token, [pull.headSha], signal)).pipe(Effect.flatMap(gitFailure));
      const diff = yield* Effect.promise(() => pullDiff(config.apiBase, pull.repo, pull.baseSha, pull.headSha, token));
      if (diff.kind === "too_large") return yield* new ReviewFailed({ why: TOO_LARGE });
      if (diff.kind === "error") return yield* new ReviewFailed({ why: `Couldn't get the diff from GitHub: ${diff.message}.` });
      const shown = reviewableDiff(diff.diff, matchesAny(rules.ignoreFiles));
      if (shown.changedLines > MAX_CHANGED_LINES || shown.diff.length > MAX_DIFF_CHARS) return yield* new ReviewFailed({ why: TOO_LARGE });
      const grant = yield* Effect.acquireRelease(auth.mintMcpToken("review", { ttlMs: TOKEN_TTL_MS }), ({ session }) => auth.revoke(session.id).pipe(Effect.ignore));
      const reading: Reading = { dir, commit: pull.headSha, opened: new Set(), submitted: null };
      yield* Effect.acquireRelease(
        Effect.sync(() => readings.set(grant.session.id, reading)),
        () => Effect.sync(() => readings.delete(grant.session.id)),
      );
      let costUsd: number | null = null;
      const turn = yield* claude
        .runTurn({
          systemPrompt: reviewSystemPrompt(rules, yield* memory.rulesOf(pull.repo)),
          prompt: reviewPrompt(pull, shown.diff),
          images: [],
          mcp: { url: `${yield* endpoint.baseUrl}/mcp`, token: grant.token },
          reproduce: false,
          propose: false,
          review: true,
          effort: null,
          account,
        })
        .pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event._tag === "Done") costUsd = event.costUsd;
            }),
          ),
          Effect.exit,
        );
      // A review that was handed in is kept however the turn ended after it, such as out of steps on
      // its last call. Only a turn that handed nothing in fails, with its own reason when it has one.
      const submitted = reading.submitted;
      if (submitted === null) return yield* Exit.isFailure(turn) ? Effect.failCause(turn.cause) : new ReviewFailed({ why: "The reviewer ended without handing in a review." });
      // The prompt already asks for P1s only; a P2 the reviewer reports anyway is still left out.
      const asked = rules.strictness === "high" ? submitted.findings.filter((finding) => finding.priority === "P1") : submitted.findings;
      const findings = yield* Effect.forEach(asked, (finding) => excerpt(reading, finding));
      yield* keep(run, { state: "done", finishedAt: yield* nowIso, costUsd, filesRead: reading.opened.size, score: submitted.score, impact: submitted.impact, reach: submitted.reach, verdict: submitted.verdict, findings });
      // After the review is kept as done, so a comment that can't be posted doesn't cost the review.
      // Uninterruptible, so a stop or the time limit can't land between GitHub taking the comment
      // and its ID being kept, which would leave a second comment for the next review to make.
      yield* Effect.uninterruptible(post(run, token, commentableLines(diff.diff)).pipe(Effect.catch(() => keep(run, { commentProblem: COULD_NOT_POST }).pipe(Effect.ignore))));
    }).pipe(Effect.scoped, Effect.timeoutOrElse({ duration: REVIEW_LIMIT, orElse: () => Effect.fail(new ReviewFailed({ why: "The review took longer than 20 minutes and was stopped." })) }));

  // However the work ended, the review says so. A stop by the server leaves it to read as cut short.
  const ended = (run: Run, exit: Exit.Exit<void, ReviewFailed | ReviewError | { readonly message: string }>) =>
    Effect.gen(function* () {
      runs.delete(keyOf(run.review.repo, run.review.number));
      // A check set pending is never left that way, which a required check would turn into a merge nobody can make.
      if (run.checked !== null) yield* setStatus(run.review, run.checked, "error", Exit.isSuccess(exit) ? "The review ended without a result" : "The review didn't finish");
      if (Exit.isSuccess(exit)) return;
      const finishedAt = yield* nowIso;
      if (Cause.hasInterruptsOnly(exit.cause)) return run.stopped ? yield* keep(run, { state: "stopped", finishedAt }) : undefined;
      const error = Cause.squash(exit.cause);
      const problem = error instanceof ReviewFailed ? error.why : error instanceof Error ? error.message : "The review failed.";
      yield* keep(run, { state: "failed", finishedAt, problem });
    }).pipe(Effect.ignore);

  const start = Effect.fn("ReviewRuns.start")(function* (repo: string, number: number) {
    const reached = yield* reach;
    if (reached === null) return yield* new ReviewError({ reason: "not_connected" });
    const settings = yield* reviews.settings;
    if (!settings.repos.includes(repo)) return yield* new ReviewError({ reason: "reviews_off" });
    const account = yield* reviewer;
    const status = yield* claude.status({ hasKey: account.apiKey !== null, home: account.home });
    if (!status.available) return yield* new ReviewError({ reason: "provider_unavailable" });
    if (!reached.repos.includes(repo)) return yield* new ReviewError({ reason: reached.problem === null ? "unknown_repo" : "github_unreachable" });
    const reply = yield* Effect.promise(() => githubRequest(config.apiBase, "GET", `repos/${repo}/pulls/${number}`, reached.token));
    if (reply.kind === "error") return yield* new ReviewError({ reason: "github_unreachable" });
    const pull = reply.kind === "ok" ? pullToReview(repo, reply.body) : null;
    if (pull === null) return yield* new ReviewError({ reason: "pull_not_found" });
    return yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const key = keyOf(repo, number);
        if (runs.has(key)) return yield* new ReviewError({ reason: "review_running" });
        const review: Review = {
          id: newId(),
          repo,
          number,
          title: pull.title,
          author: pull.author,
          branch: pull.branch,
          base: pull.base,
          headSha: pull.headSha,
          additions: pull.additions,
          deletions: pull.deletions,
          changedFiles: pull.changedFiles,
          state: "queued",
          startedAt: yield* nowIso,
          finishedAt: null,
          model: settings.model,
          costUsd: null,
          filesRead: 0,
          score: null,
          impact: null,
          reach: null,
          verdict: null,
          findings: [],
          problem: null,
        };
        yield* store.put(review);
        const run: Run = { review, stopped: false, checked: null };
        runs.set(key, run);
        // Forked into the service's scope, so stopping the server interrupts it.
        run.fiber = yield* store.live(review.id, oneAtATime.withPermits(1)(work(run, pull, { label: account.label, model: settings.model, apiKey: account.apiKey, home: account.home }, settings.rules)).pipe(Effect.onExit((exit) => ended(run, exit)))).pipe(Effect.forkIn(scope));
        return review;
      }),
    );
  });

  const stop = Effect.fn("ReviewRuns.stop")(function* (repo: string, number: number) {
    const run = runs.get(keyOf(repo, number));
    if (run === undefined) return yield* new ReviewError({ reason: "no_review" });
    run.stopped = true;
    if (run.fiber) yield* Fiber.interrupt(run.fiber);
    return run.review;
  });

  const read = (repo: string, number: number, canReview: boolean) => store.list(repo, number).pipe(Effect.map((kept) => ({ reviews: kept, canReview })));

  const reading = (sessionId: string): Effect.Effect<Reading, ToolRefused> => {
    const found = readings.get(sessionId);
    return found === undefined ? Effect.fail({ message: "Only a review's own turn can read its code." }) : Effect.succeed(found);
  };
  const answer = <A>(result: GitResult<A>): Effect.Effect<A, ToolRefused> => (result.ok ? Effect.succeed(result.value) : Effect.fail({ message: result.why }));

  const readFile = (sessionId: string, path: string, from: number | undefined, to: number | undefined) =>
    reading(sessionId).pipe(
      Effect.flatMap((found) =>
        Effect.promise((signal) => readLines(found.dir, found.commit, path, from ?? 1, to ?? (from ?? 1) + MAX_READ_LINES - 1, signal)).pipe(
          Effect.flatMap(answer),
          Effect.tap(() => Effect.sync(() => found.opened.add(path))),
        ),
      ),
    );
  const search = (sessionId: string, pattern: string, options: { readonly glob?: string | undefined; readonly ignoreCase?: boolean | undefined }) =>
    reading(sessionId).pipe(Effect.flatMap((found) => Effect.promise((signal) => searchLines(found.dir, found.commit, pattern, options, signal))), Effect.flatMap(answer));
  const listFiles = (sessionId: string, glob: string | undefined) =>
    reading(sessionId).pipe(Effect.flatMap((found) => Effect.promise((signal) => listPaths(found.dir, found.commit, glob, signal))), Effect.flatMap(answer));
  const submit = (sessionId: string, review: SubmittedReview) => reading(sessionId).pipe(Effect.map((found) => void (found.submitted = review)));

  return ReviewRuns.of({ read, start, stop, readFile, search, listFiles, submit });
});

export const layer = Layer.effect(ReviewRuns, make);
