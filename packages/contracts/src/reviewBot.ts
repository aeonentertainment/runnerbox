import * as Schema from "effect/Schema";

// The review bot: a GitHub App the owner creates for this server alone, so reviews are posted to
// pull requests under a bot's name rather than their own. Its private key stays on the server's
// machine and is never part of any answer here.

export const ReviewBot = Schema.Struct({
  // The App as GitHub names it. `slug` is where it lives: github.com/apps/<slug>.
  slug: Schema.String,
  name: Schema.String,
  // Where the owner picks the repositories the bot may comment on.
  installUrl: Schema.String,
  createdAt: Schema.String,
});
export type ReviewBot = typeof ReviewBot.Type;

export const ReviewBotStatus = Schema.Struct({ bot: Schema.NullOr(ReviewBot) });
export type ReviewBotStatus = typeof ReviewBotStatus.Type;

// What the owner's browser posts to GitHub to create the App: `manifest` as the form's one field,
// to `action`. GitHub shows the App's name and permissions to confirm before it exists.
export const ReviewBotSetup = Schema.Struct({ action: Schema.String, manifest: Schema.String });
export type ReviewBotSetup = typeof ReviewBotSetup.Type;

export const ReviewBotSetupRequest = Schema.Struct({
  // The address the owner's browser reaches this server at, which GitHub sends it back to. Only an
  // address on the browser's own machine is taken.
  redirectBase: Schema.String,
  // An organization to own the App, or the signed-in GitHub user when left out.
  organization: Schema.optionalKey(Schema.String),
});

export class ReviewBotError extends Schema.TaggedError<ReviewBotError>()("ReviewBotError", {
  reason: Schema.Literals(["unreadable", "bad_redirect", "bad_organization", "exists"]),
}) {
  override get message() {
    switch (this.reason) {
      case "unreadable":
        return "Couldn't read or write the review bot on the server.";
      case "bad_redirect":
        return "The review bot can only be set up from the machine the app runs on, at a loopback address.";
      case "bad_organization":
        return "That isn't an organization name GitHub would take.";
      case "exists":
        return "This server already has a review bot. Remove it first.";
    }
  }
}
