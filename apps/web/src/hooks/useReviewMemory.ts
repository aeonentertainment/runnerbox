import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { runtime } from "../runtime.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { reviewMemoryAtom } from "../state/reviewMemory.ts";

// A machine's rules for each repository's reviewer, and adding or removing one.
export function useReviewMemory(environmentId: string) {
  const memory = Option.getOrNull(AsyncResult.value(useAtomValue(reviewMemoryAtom(environmentId))));
  const show = useAtomSet(reviewMemoryAtom(environmentId));
  return {
    available: useAtomValue(capabilitiesAtom(environmentId)).reviewMemory,
    memory,
    remember: (repo: string, text: string) => runtime.run(environmentId, (client) => client["reviews.remember"]({ repo, text })).then(show),
    forget: (repo: string, id: string) => runtime.run(environmentId, (client) => client["reviews.forget"]({ repo, id })).then(show),
  };
}
