import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import { answerOf } from "../../lib/answer.ts";
import { appAtomRegistry } from "../../rpc/atomRegistry.ts";
import { runtime } from "../../runtime.ts";
import { alertDestinationsAtom, connectStatusAtom } from "../../state/connect.ts";
import { Button } from "../ui/button.tsx";
import { SettingsRow } from "./settingsLayout.tsx";

// Alerts in Slack, through the RunnerBox account this app is signed in to. The relay keeps the
// channel; the app only starts the install and shows which channel.
export function SlackDestination() {
  const connect = runtime.connect;
  const status = answerOf(useAtomValue(connectStatusAtom));
  const destinations = answerOf(useAtomValue(alertDestinationsAtom));
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const refresh = () => appAtomRegistry.refresh(alertDestinationsAtom);
  const act = (work: Promise<void>, after: () => void) => {
    setError(null);
    work.then(after, (cause: unknown) => setError(cause instanceof Error ? cause.message : "That didn't work."));
  };
  const slack = destinations.data?.slack ?? null;
  const description =
    connect?.connectSlack === undefined
      ? "Alerts go to Slack through your RunnerBox account, from the desktop app."
      : !status.data?.signedIn
        ? "Sign in to RunnerBox Connect under Settings, Environments, and link this server, to send its alerts to Slack."
        : slack
          ? `Alerts from servers linked to your account go to ${slack.channel} in ${slack.team}.`
          : waiting
            ? "Finish in the browser, then check again."
            : "Pick a channel in Slack. Alerts from servers linked to your account go there.";
  return (
    <SettingsRow
      title="Slack"
      description={error ?? description}
      control={
        connect?.connectSlack === undefined || !status.data?.signedIn ? null : slack ? (
          <Button size="sm" variant="outline" onClick={() => act(connect.disconnectSlack?.() ?? Promise.resolve(), refresh)}>
            Disconnect
          </Button>
        ) : waiting ? (
          <Button size="sm" variant="outline" onClick={refresh}>
            Check again
          </Button>
        ) : (
          <Button size="sm" onClick={() => act(connect.connectSlack?.() ?? Promise.resolve(), () => setWaiting(true))}>
            Connect Slack
          </Button>
        )
      }
    />
  );
}
