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

// Where the owner's browser starts: a page on this server that sends the App's manifest on to
// GitHub, which shows its name and permissions to confirm before it exists. GitHub takes the
// manifest only as a posted form, which a link can't carry, so the page holds the form.
export const ReviewBotSetup = Schema.Struct({ startUrl: Schema.String });
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
