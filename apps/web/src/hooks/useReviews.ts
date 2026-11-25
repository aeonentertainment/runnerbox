import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { runtime } from "../runtime.ts";
import { capabilitiesAtom } from "../state/connections.ts";
import { reviewsAtom } from "../state/reviews.ts";
import { useActiveEnvironment } from "./useEnvironment.ts";

// The active environment's reviews: the repositories the GitHub App is installed on, their open
// pull requests, each with its newest review, and the settings that pick what's reviewed.
// `available` is false on a server older than reviews, and `posting` on one older than posting them.
export function useReviews() {
  const { environment } = useActiveEnvironment();
  const environmentId = environment?.environmentId ?? "";
  const status = useAtomValue(reviewsAtom(environmentId));
  // Every change answers with the view as it now is, so it's shown without asking again.
  const show = useAtomSet(reviewsAtom(environmentId));
  const capabilities = useAtomValue(capabilitiesAtom(environmentId));
  return {
    available: capabilities.reviews,
    posting: capabilities.reviewPosting,
    view: Option.getOrNull(AsyncResult.value(status)),
    setRepo: (repo: string, review: boolean) => runtime.run(environmentId, (client) => client["reviews.setRepo"]({ repo, review })).then(show),
    setPost: (repo: string, post: boolean) => runtime.run(environmentId, (client) => client["reviews.setPost"]({ repo, post })).then(show),
    setModel: (model: string) => runtime.run(environmentId, (client) => client["reviews.setModel"]({ model })).then(show),
  };
}
