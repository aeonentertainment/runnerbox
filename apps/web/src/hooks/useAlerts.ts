import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { AlertRule } from "@runnerbox/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { runtime } from "../runtime.ts";
import { alertsAtom } from "../state/alerts.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { useActiveEnvironment } from "./useEnvironment.ts";

// The active machine's alert rules, what they fired, and saving the rules.
export function useAlerts() {
  const environmentId = useActiveEnvironment().environment?.environmentId ?? "";
  const show = useAtomSet(alertsAtom(environmentId));
  return {
    available: useAtomValue(capabilitiesAtom(environmentId)).alerts,
    view: Option.getOrNull(AsyncResult.value(useAtomValue(alertsAtom(environmentId)))),
    setRules: (rules: ReadonlyArray<AlertRule>) => runtime.run(environmentId, (client) => client["alerts.setRules"]({ rules })).then(show),
  };
}
