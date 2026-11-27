import * as Schema from "effect/Schema";
import { RepoName } from "./history.ts";

// Tests that failed in an attempt that then passed when retried, read from those attempts' logs.
export const FlakyTest = Schema.Struct({
  repo: RepoName,
  job: Schema.String,
  test: Schema.String,
  // Distinct runs it flaked in, in the range.
  flakes: Schema.Int,
  lastAt: Schema.String,
  // The failed attempts it flaked in, the newest first, at most five.
  jobIds: Schema.Array(Schema.Number),
});
export type FlakyTest = typeof FlakyTest.Type;

export const FlakyTests = Schema.Struct({
  // The most flakes first.
  tests: Schema.Array(FlakyTest),
  // Attempts that failed and then passed when retried, in the range.
  flakyJobs: Schema.Int,
  // Of those, the ones whose logs haven't been read yet; asking again reads more.
  unread: Schema.Int,
});
export type FlakyTests = typeof FlakyTests.Type;
