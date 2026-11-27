import type { AlertsView } from "@runnerbox/contracts";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom } from "effect/reactivity";
import { polled } from "../lib/polled.ts";
import { capabilitiesAtom, connectedAtom } from "./connections.ts";

// A machine's alert rules and what they fired, asked every minute, as often as the server checks.
const askedAtom = Atom.family((environmentId: string) =>
  Atom.make((get) => {
    const connection = get(connectedAtom(environmentId));
    return connection === null || !get(capabilitiesAtom(environmentId)).alerts ? Stream.never : polled(connection.client["alerts.status"](), "60 seconds");
  }).pipe(Atom.setIdleTTL("5 minutes")),
);

// Saving the rules answers with the view as it now is, which shows until the next ask.
export const alertsAtom = Atom.family((environmentId: string) =>
  Atom.writable(
    (get) => get(askedAtom(environmentId)),
    (ctx, view: AlertsView) => ctx.setSelf(AsyncResult.success(view)),
    (refresh) => refresh(askedAtom(environmentId)),
  ).pipe(Atom.setIdleTTL("5 minutes")),
);
