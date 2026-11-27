import * as Schema from "effect/Schema";
import { RepoName } from "./history.ts";

// Alerts: rules the owner writes about CI and reviews, checked every minute, and what fired. Where
// an alert goes beyond the app's notification list is a destination's concern.

export const AlertKind = Schema.Literals(["job_failed", "fails_in_a_row", "slow_job", "long_wait", "review_p1"]);
export type AlertKind = typeof AlertKind.Type;

const Pattern = Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)));

export const AlertRule = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)),
  kind: AlertKind,
  enabled: Schema.Boolean,
  // Null matches any. `job` matches part of a job's name, ignoring case; `branch` the whole branch.
  repo: Schema.NullOr(RepoName),
  branch: Pattern,
  job: Pattern,
  // Minutes for `slow_job` and `long_wait`, failures for `fails_in_a_row`. Null for the others.
  threshold: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1440 }))),
});
export type AlertRule = typeof AlertRule.Type;
export const MAX_ALERT_RULES = 50;

// What an alert is about, for the app to open.
export const AlertSubject = Schema.Union([
  Schema.TaggedStruct("run", { repo: RepoName, jobId: Schema.Number }),
  Schema.TaggedStruct("pull", { repo: RepoName, number: Schema.Int }),
]);

export const FiredAlert = Schema.Struct({
  id: Schema.String,
  ruleId: Schema.String,
  kind: AlertKind,
  title: Schema.String,
  subject: AlertSubject,
  at: Schema.String,
});
export type FiredAlert = typeof FiredAlert.Type;

export const AlertsView = Schema.Struct({
  rules: Schema.Array(AlertRule),
  // The newest first, at most a hundred.
  fired: Schema.Array(FiredAlert),
  canConfigure: Schema.Boolean,
});
export type AlertsView = typeof AlertsView.Type;

export class AlertsError extends Schema.TaggedError<AlertsError>()("AlertsError", { reason: Schema.Literals(["unreadable", "too_many"]) }) {
  override get message() {
    return this.reason === "too_many" ? `At most ${MAX_ALERT_RULES} alert rules.` : "Couldn't read or write the alert rules on the server.";
  }
}
