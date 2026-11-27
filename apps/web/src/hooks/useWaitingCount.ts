import { isInboxItemHidden } from "@runnerbox/contracts";
import { useAtomValue } from "@effect/atom-react";
import { needsYouEverywhere } from "../lib/needsYouEverywhere.ts";
import { inboxesAtom } from "../state/inbox.ts";
import { useRange } from "./useRange.ts";

// How many notifications are waiting, across every connected machine, not only the one picked in
// the switcher. The rail and the phone's bottom bar both badge it.
export function useWaitingCount() {
  const { days } = useRange();
  const inboxes = useAtomValue(inboxesAtom(days));
  return needsYouEverywhere(inboxes).filter((item) => !isInboxItemHidden(item)).length;
}
