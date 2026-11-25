import type { ReviewBotStatus } from "@runnerbox/contracts";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom } from "effect/reactivity";
import { polled } from "../lib/polled.ts";
import { capabilitiesAtom, connectedAtom } from "./connections.ts";

// A machine's review bot as an atom: the GitHub App it posts reviews as, or none. Asked every few
// seconds while a page reads it, since the bot appears when the owner finishes on GitHub, in
// another window, and the server learns of it on its own.
const askedAtom = Atom.family((environmentId: string) =>
  Atom.make((get) => {
    const connection = get(connectedAtom(environmentId));
    if (connection === null || !get(capabilitiesAtom(environmentId)).reviewBot) return Stream.never;
    return polled(connection.client["github.botStatus"](), "5 seconds");
  }).pipe(Atom.setIdleTTL("1 minute")),
);

// The status, which removing the bot also writes: it answers with the status as it now is.
export const reviewBotAtom = Atom.family((environmentId: string) =>
  Atom.writable(
    (get) => get(askedAtom(environmentId)),
    (ctx, status: ReviewBotStatus) => ctx.setSelf(AsyncResult.success(status)),
    (refresh) => refresh(askedAtom(environmentId)),
  ).pipe(Atom.setIdleTTL("1 minute")),
);
