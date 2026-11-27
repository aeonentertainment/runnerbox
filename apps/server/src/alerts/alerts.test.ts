import assert from "node:assert/strict";
import { test } from "node:test";
import { openSession, pairWithCode } from "@runnerbox/client-runtime";
import { ALL_SCOPES, type AlertRule, type AuthScope } from "@runnerbox/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { startTestServer } from "../testing/testServer.ts";

test("alert rules are saved by a session that may write and read back by one that may read", async () => {
  const server = await startTestServer({});
  const session = async <A, E>(scopes: ReadonlyArray<AuthScope>, use: (client: Effect.Success<ReturnType<typeof openSession>>["client"]) => Effect.Effect<A, E>) => {
    const { code } = await server.createPairingCode(scopes);
    const { token } = await Effect.runPromise(pairWithCode(server.baseUrl, code, "app"));
    return Effect.runPromise(Effect.scoped(Effect.flatMap(openSession(server.baseUrl, token), ({ client }) => Effect.exit(use(client)))));
  };
  const rule: AlertRule = { id: "a", kind: "job_failed", enabled: true, repo: "owner/name", branch: "main", job: null, threshold: null };
  try {
    const saved = await session(ALL_SCOPES, (client) => client["alerts.setRules"]({ rules: [rule] }));
    assert.ok(Exit.isSuccess(saved) && saved.value.canConfigure);
    const read = await session(["history:read"], (client) => client["alerts.status"]());
    assert.ok(Exit.isSuccess(read));
    assert.deepEqual([read.value.rules, read.value.canConfigure], [[rule], false]);
    const refused = await session(["history:read"], (client) => client["alerts.setRules"]({ rules: [] }));
    assert.ok(Exit.isFailure(refused) && /access:write/.test(Cause.pretty(refused.cause)));
  } finally {
    await server.close();
  }
});
