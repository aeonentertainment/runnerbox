import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { loopbackOrigin } from "@runnerbox/client-runtime";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { runtime } from "../runtime.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { reviewBotAtom } from "../state/reviewBot.ts";
import { useActiveEnvironment } from "./useEnvironment.ts";

// The active environment's review bot, and what this window can do about it. `available` is false
// on a server older than the bot. `reachable` is false when the server isn't reached on this
// machine's loopback: GitHub sends the owner's browser back to the server, so a bot can only be
// created where the browser can reach it.
export function useReviewBot() {
  const { environment, connection } = useActiveEnvironment();
  const environmentId = environment?.environmentId ?? "";
  const status = useAtomValue(reviewBotAtom(environmentId));
  const write = useAtomSet(reviewBotAtom(environmentId));
  const redirectBase = connection?.status === "connected" ? loopbackOrigin(connection.baseUrl) : null;
  return {
    available: useAtomValue(capabilitiesAtom(environmentId)).reviewBot,
    reachable: redirectBase !== null,
    bot: Option.getOrUndefined(AsyncResult.value(status))?.bot ?? null,
    known: Option.isSome(AsyncResult.value(status)),
    // Answers with the page the owner's browser starts on.
    setup: async (organization: string) => {
      if (redirectBase === null) throw new Error("The review bot can only be set up from the machine the app runs on.");
      const name = organization.trim();
      return (await runtime.run(environmentId, (client) => client["github.botSetup"]({ redirectBase, ...(name ? { organization: name } : {}) }))).startUrl;
    },
    remove: () => runtime.run(environmentId, (client) => client["github.botRemove"]()).then(write),
  };
}
