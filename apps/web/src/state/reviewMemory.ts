import type { RepoMemory } from "@runnerbox/contracts";
import * as Effect from "effect/Effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { capabilitiesAtom, connectedAtom } from "./connections.ts";

// A machine's rules for each repository's reviewer, asked once; adding or removing one answers with
// them all, which is written here.
const askedAtom = Atom.family((environmentId: string) =>
  Atom.make((get) => {
    const connection = get(connectedAtom(environmentId));
    return connection === null || !get(capabilitiesAtom(environmentId)).reviewMemory ? Effect.never : connection.client["reviews.memory"]();
  }).pipe(Atom.setIdleTTL("5 minutes")),
);

export const reviewMemoryAtom = Atom.family((environmentId: string) =>
  Atom.writable(
    (get) => get(askedAtom(environmentId)),
    (ctx, memory: ReadonlyArray<RepoMemory>) => ctx.setSelf(AsyncResult.success(memory)),
    (refresh) => refresh(askedAtom(environmentId)),
  ).pipe(Atom.setIdleTTL("5 minutes")),
);
