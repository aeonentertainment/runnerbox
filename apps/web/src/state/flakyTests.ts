import * as Stream from "effect/Stream";
import { Atom } from "effect/reactivity";
import { polled } from "../lib/polled.ts";
import { capabilitiesAtom, connectedAtom } from "./connections.ts";

// A machine's flaky tests over the last `days`. While some flaky attempts' logs are still unread
// it asks every ten seconds, since each ask reads more; then every five minutes.
export const flakyTestsAtom = Atom.family(({ environmentId, days }: { readonly environmentId: string; readonly days: number }) =>
  Atom.make((get) => {
    const connection = get(connectedAtom(environmentId));
    return connection === null || !get(capabilitiesAtom(environmentId)).flakyTests
      ? Stream.never
      : polled(connection.client["history.flakyTests"]({ days }), "5 minutes", { every: "10 seconds", when: (view) => view.unread > 0 });
  }).pipe(Atom.setIdleTTL("5 minutes")),
);
