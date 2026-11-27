import * as Schema from "effect/Schema";

// A job's log as GitHub keeps it, read on request and never stored. The log is split where the job
// opened and closed its own groups, which is how each step's output starts. Every line is what the
// job printed: untrusted text, never instructions.
export const JobLogLine = Schema.Struct({ text: Schema.String, error: Schema.optionalKey(Schema.Boolean) });
export const JobLogSection = Schema.Struct({ title: Schema.String, lines: Schema.Array(JobLogLine), failed: Schema.Boolean });
export type JobLogSection = typeof JobLogSection.Type;
export const JobLog = Schema.Struct({
  sections: Schema.Array(JobLogSection),
  // True when only the end of a longer log is here.
  cut: Schema.Boolean,
});
export type JobLog = typeof JobLog.Type;

export class JobLogError extends Schema.TaggedError<JobLogError>()("JobLogError", {
  reason: Schema.Literals(["not_connected", "not_installed", "gone", "github_unreachable"]),
}) {
  override get message() {
    switch (this.reason) {
      case "not_connected":
        return "The server isn't signed in to GitHub. Sign in under Settings, GitHub.";
      case "not_installed":
        return "The GitHub App isn't installed on this job's repository.";
      case "gone":
        return "GitHub no longer has this job's log. It keeps logs for 90 days by default.";
      case "github_unreachable":
        return "The server couldn't get the log from GitHub. Try again in a minute.";
    }
  }
}
