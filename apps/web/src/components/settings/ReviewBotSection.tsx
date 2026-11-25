import { useState } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard.ts";
import { useReviewBot } from "../../hooks/useReviewBot.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { SettingsRow, SettingsSection } from "./settingsLayout.tsx";
import { StatusDot } from "./StatusDot.tsx";

const link = "text-foreground underline-offset-4 hover:underline";
const outside = { target: "_blank", rel: "noreferrer noopener" } as const;
const words = (cause: unknown) => (cause instanceof Error ? cause.message : "That didn't work.");

// The review bot: a GitHub App of the owner's own, which reviews are posted as. Creating it is
// finished on GitHub, in the browser, so this starts it and then waits for the server to say the
// bot exists. `canConfigure` is whether this device may sign the server in, which is the same bar.
export function ReviewBotSection({ canConfigure }: { canConfigure: boolean }) {
  const { available, reachable, bot, known, setup, remove } = useReviewBot();
  const [organization, setOrganization] = useState("");
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  if (!available || !known) return null;
  const act = (work: Promise<unknown>) => {
    setError(null);
    work.catch((cause: unknown) => setError(words(cause)));
  };
  return (
    <SettingsSection title="Review bot">
      {bot !== null ? (
        <>
          <SettingsRow
            title={
              <span className="flex items-center gap-2">
                <StatusDot available />
                {bot.name}
              </span>
            }
            description="Reviews are posted to pull requests as this bot, on the repositories you pick for it on GitHub."
            control={
              <a href={bot.installUrl} {...outside} className={link}>
                Choose repositories on GitHub
              </a>
            }
          />
          {canConfigure ? (
            <SettingsRow
              title="Remove the bot"
              description="Deletes its key from this server. The app stays on GitHub until you delete it there."
              control={
                <Button size="sm" variant="destructive-outline" onClick={() => act(remove().then(() => setStartUrl(null)))}>
                  Remove
                </Button>
              }
            />
          ) : null}
        </>
      ) : startUrl !== null ? (
        <SettingsRow
          title="Finish on GitHub"
          description="GitHub shows the bot's name and what it may do before creating it. This page updates once it exists."
          control={
            <div className="flex items-center gap-2">
              <Button size="sm" render={<a href={startUrl} {...outside} />}>
                Continue in your browser
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(startUrl)}>
                {isCopied ? "Copied" : "Copy link"}
              </Button>
            </div>
          }
        />
      ) : (
        <SettingsRow
          title="No review bot"
          description={
            !canConfigure
              ? "This device can't create one."
              : reachable
                ? "Create a GitHub app of your own for this server, so reviews are posted to pull requests under a bot's name. It asks to write to pull requests and nothing else. Leave the organization empty to own it yourself."
                : "Open runnerbox on the server's own machine, or reach it over SSH, to create one. GitHub has to send your browser back to the server."
          }
          control={
            canConfigure && reachable ? (
              <div className="flex items-center gap-2">
                <Input size="sm" aria-label="Organization" placeholder="Organization" className="w-36" value={organization} onChange={(event) => setOrganization(event.target.value)} />
                <Button size="sm" onClick={() => act(setup(organization).then(setStartUrl))}>
                  Create review bot
                </Button>
              </div>
            ) : undefined
          }
        />
      )}
      {error ? <p className="px-3 py-3 text-destructive text-xs sm:px-4">{error}</p> : null}
    </SettingsSection>
  );
}
