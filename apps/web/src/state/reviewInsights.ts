import * as Stream from "effect/Stream";
import { Atom } from "effect/reactivity";
import { latest, polledOrFailed } from "../lib/polled.ts";
import { connectedAtom } from "./connections.ts";

// What a machine's finished reviews found over the last `days`, asked every minute, since reviews
// finish all the time. A failure shows beside the last answer until an ask answers.
export const reviewInsightsAtom = Atom.family(({ environmentId, days }: { readonly environmentId: string; readonly days: number }) =>
  Atom.make((get) => {
    const connection = get(connectedAtom(environmentId));
    return connection === null ? Stream.never : polledOrFailed(connection.client["reviews.insights"]({ days }), "60 seconds");
  }).pipe(latest, Atom.setIdleTTL("5 minutes")),
);
