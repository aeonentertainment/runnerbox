import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { openSession, pairWithCode } from "@runnerbox/client-runtime";
import { ALL_SCOPES, type AuthScope } from "@runnerbox/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { TEST_APP, USER_TOKEN, writeGitHubSession } from "../testing/githubSession.ts";
import { startTestServer } from "../testing/testServer.ts";

const TIMING = { pollMs: 50, slowMs: 300, maxBackoffMs: 400, idleMs: 200, checkMs: 20 };

test("a job is rerun through the sign-in on a repository the App is installed on, only by a session that may write", async () => {
  const asked: string[] = [];
  const github = createServer((request, response) => {
    const path = request.url ?? "";
    const json = (status: number, body: unknown) => void response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (request.headers.authorization !== `Bearer ${USER_TOKEN}`) return json(401, {});
    if (path.startsWith("/user/installations?")) return json(200, { installations: [{ id: 11, repository_selection: "selected", account: { login: "owner" } }] });
    if (path.startsWith("/user/installations/11/repositories?")) return json(200, { total_count: 1, repositories: [{ full_name: "owner/name" }] });
    if (request.method === "POST" && path.endsWith("/rerun")) {
      asked.push(path);
      return path === "/repos/owner/name/actions/jobs/5/rerun" ? json(201, {}) : json(403, {});
    }
    json(404, {});
  });
  await new Promise<void>((resolve) => github.listen(0, "127.0.0.1", resolve));
  const address = github.address();
  const apiBase = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const server = await startTestServer({ prepare: writeGitHubSession, queue: { apiBase, app: TEST_APP, reportEnvPath: "/nonexistent/report.env", timing: TIMING } });
  const session = async <A, E>(scopes: ReadonlyArray<AuthScope>, use: (client: Effect.Success<ReturnType<typeof openSession>>["client"]) => Effect.Effect<A, E>) => {
    const { code } = await server.createPairingCode(scopes);
    const { token } = await Effect.runPromise(pairWithCode(server.baseUrl, code, "app"));
    return Effect.runPromise(Effect.scoped(Effect.flatMap(openSession(server.baseUrl, token), ({ client }) => Effect.exit(use(client)))));
  };
  try {
    assert.ok(Exit.isSuccess(await session(ALL_SCOPES, (client) => client["history.rerunJob"]({ repo: "owner/name", jobId: 5 }))));
    const refused = await session(ALL_SCOPES, (client) => client["history.rerunJob"]({ repo: "owner/name", jobId: 6 }));
    assert.ok(Exit.isFailure(refused) && /wouldn't rerun it/.test(Cause.pretty(refused.cause)));
    const elsewhere = await session(ALL_SCOPES, (client) => client["history.rerunJob"]({ repo: "owner/other", jobId: 5 }));
    assert.ok(Exit.isFailure(elsewhere) && /isn't installed/.test(Cause.pretty(elsewhere.cause)));
    const reader = await session(["history:read", "runners:read"], (client) => client["history.rerunJob"]({ repo: "owner/name", jobId: 5 }));
    assert.ok(Exit.isFailure(reader) && /access:write/.test(Cause.pretty(reader.cause)));
    // GitHub was asked only by the sessions that may, and never about the repository the App isn't on.
    assert.deepEqual(asked, ["/repos/owner/name/actions/jobs/5/rerun", "/repos/owner/name/actions/jobs/6/rerun"]);
  } finally {
    await server.close();
    github.close();
  }
});
