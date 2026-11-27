import * as Schema from "effect/Schema";

export class RerunError extends Schema.TaggedError<RerunError>()("RerunError", {
  reason: Schema.Literals(["not_connected", "not_installed", "refused", "not_found", "github_unreachable"]),
}) {
  override get message() {
    switch (this.reason) {
      case "not_connected":
        return "The server isn't signed in to GitHub. Sign in under Settings, GitHub.";
      case "not_installed":
        return "The GitHub App isn't installed on this job's repository.";
      case "refused":
        return "GitHub wouldn't rerun it. Its run may still be going or be more than 30 days old, or the App may need Actions: Read and write.";
      case "not_found":
        return "GitHub doesn't have this job any more.";
      case "github_unreachable":
        return "The server couldn't reach GitHub. Try again in a minute.";
    }
  }
}
