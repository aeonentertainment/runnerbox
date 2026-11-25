import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { loopbackOrigin } from "@runnerbox/client-runtime";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { runtime } from "../runtime.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { reviewBotAtom } from "../state/reviewBot.ts";
import { useActiveEnvironment } from "./useEnvironment.ts";

// The active environment's review bot, and what this window can do about it. `available` is false
// on a server older than the bot. `reachable` is true only for a server on this machine, reached
// at its own loopback address: GitHub sends the owner's browser back to the server with the code
// that buys the bot's key. A server reached over SSH answers on a forwarded port that changes when
// the tunnel does, so the code could arrive at a port nothing of ours listens on.
export function useReviewBot() {
  const { environment, connection } = useActiveEnvironment();
  const environmentId = environment?.environmentId ?? "";
  const status = useAtomValue(reviewBotAtom(environmentId));
  const write = useAtomSet(reviewBotAtom(environmentId));
  const redirectBase = connection?.status === "connected" && connection.route.kind === "direct" ? loopbackOrigin(connection.baseUrl) : null;
  return {
    environmentId,
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
