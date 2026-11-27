import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as CloudLink from "../cloud/CloudLink.ts";
import * as Alerts from "./Alerts.ts";

// Sends each alert as it fires beyond the app, through the relay this machine is linked to, which
// posts wherever the account connected, such as Slack. A machine that isn't linked keeps its
// alerts in the app. A send that fails isn't retried: the alert is still in the app.
export class AlertDelivery extends Context.Service<AlertDelivery, {}>()("runnerbox/server/alerts/AlertDelivery") {}

const make = Effect.gen(function* () {
  const alerts = yield* Alerts.Alerts;
  const cloud = yield* CloudLink.CloudLink;
  const send = (alert: { readonly kind: string; readonly title: string }) =>
    cloud.state.pipe(
      Effect.flatMap((linked) => (linked === null ? Effect.void : cloud.notify(alert))),
      Effect.ignore,
    );
  yield* Effect.forkScoped(alerts.fired.pipe(Stream.runForEach(send)));
  return AlertDelivery.of({});
});

export const layer = Layer.effect(AlertDelivery, make);
