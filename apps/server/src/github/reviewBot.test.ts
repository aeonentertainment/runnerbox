import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { openSession, pairWithCode } from "@runnerbox/client-runtime";
import { ALL_SCOPES, type AuthScope } from "@runnerbox/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { startTestServer } from "../testing/testServer.ts";

const TIMING = { pollMs: 50, slowMs: 300, maxBackoffMs: 400, idleMs: 200, checkMs: 20 };

// A stand-in for GitHub's side of the manifest flow: it trades the one code it knows for an App
// with a key made for this run, and counts how often it was asked.
async function fakeGitHub() {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const asked: string[] = [];
  const server = createServer((request, response) => {
    asked.push(`${request.method} ${request.url}`);
    if (request.method === "POST" && request.url === "/app-manifests/good-code/conversions")
      return void response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: 42, client_id: "Iv1.example", slug: "example-reviews", name: "Example Reviews", pem, client_secret: "not-a-real-client-secret", webhook_secret: null }));
    response.writeHead(404, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  return { base, pem, asked, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function start() {
  const github = await fakeGitHub();
  const server = await startTestServer({ queue: { apiBase: github.base, loginBase: github.base, reportEnvPath: "/nonexistent/report.env", timing: TIMING } });
  const session = async <A, E>(scopes: ReadonlyArray<AuthScope>, use: (client: Effect.Success<ReturnType<typeof openSession>>["client"]) => Effect.Effect<A, E>) => {
    const { code } = await server.createPairingCode(scopes);
    const { token } = await Effect.runPromise(pairWithCode(server.baseUrl, code, "app"));
    return Effect.runPromise(Effect.scoped(Effect.flatMap(openSession(server.baseUrl, token), ({ client }) => Effect.exit(use(client)))));
  };
  const redirect = (code: string, state: string) => fetch(`${server.baseUrl}/api/github/bot-created?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
  const file = join(server.stateDir, ".server", "review-bot.json");
  return { github, server, session, redirect, file, close: () => Promise.all([server.close(), github.close()]) };
}

test("the bot is created only by the redirect its setup started, once, and its key stays on the server", async () => {
  const { github, server, session, redirect, file, close } = await start();
  try {
    const setup = await session(ALL_SCOPES, (client) => client["github.botSetup"]({ redirectBase: server.baseUrl }));
    assert.ok(Exit.isSuccess(setup));
    const action = new URL(setup.value.action);
    const state = action.searchParams.get("state") ?? "";
    assert.equal(`${action.origin}${action.pathname}`, `${github.base}/settings/apps/new`);
    // What GitHub is asked to create: one permission, no webhook, and a way back to this server only.
    assert.deepEqual(JSON.parse(setup.value.manifest), { name: "runnerbox reviews", url: "https://runnerbox.dev", redirect_url: `${server.baseUrl}/api/github/bot-created`, public: false, default_permissions: { pull_requests: "write" }, default_events: [] });

    // A redirect that doesn't carry the setup's state does nothing, and GitHub isn't asked.
    assert.equal((await redirect("good-code", "someone-elses-state")).status, 400);
    assert.deepEqual(github.asked, []);

    const created = await redirect("good-code", state);
    assert.equal(created.status, 200);
    assert.ok(!(await created.text()).includes("PRIVATE KEY"), "the page shows no key");
    // The same redirect again is refused: the setup is spent.
    assert.equal((await redirect("good-code", state)).status, 400);
    assert.deepEqual(github.asked, ["POST /app-manifests/good-code/conversions"]);

    const status = await session(["history:read"], (client) => client["github.botStatus"]());
    assert.ok(Exit.isSuccess(status));
    assert.deepEqual([status.value.bot?.slug, status.value.bot?.name, status.value.bot?.installUrl], ["example-reviews", "Example Reviews", `${github.base}/apps/example-reviews/installations/new`]);
    assert.ok(!JSON.stringify(status.value).includes("PRIVATE KEY"), "no RPC answer holds the key");

    // The key is on disk for the owner alone, and the secrets nothing uses aren't kept.
    const kept = await readFile(file, "utf8");
    assert.ok(kept.includes(JSON.stringify(github.pem).slice(1, 40)));
    assert.ok(!kept.includes("not-a-real-client-secret"));
    assert.equal((await stat(file)).mode & 0o777, 0o600);

    // A second bot isn't made over the first.
    const again = await session(ALL_SCOPES, (client) => client["github.botSetup"]({ redirectBase: server.baseUrl }));
    assert.ok(Exit.isFailure(again));
    const removed = await session(ALL_SCOPES, (client) => client["github.botRemove"]());
    assert.ok(Exit.isSuccess(removed) && removed.value.bot === null);
    await assert.rejects(stat(file));
  } finally {
    await close();
  }
});

test("a setup is refused when GitHub would send the code anywhere but this machine, or by a session that can't sign the server in", async () => {
  const { server, session, close } = await start();
  try {
    for (const redirectBase of ["https://example.com", "http://example.com:4517", "http://127.0.0.1:4517/elsewhere", "http://127.0.0.1.example.com:80"]) {
      const refused = await session(ALL_SCOPES, (client) => client["github.botSetup"]({ redirectBase }));
      assert.ok(Exit.isFailure(refused), `${redirectBase} is refused`);
    }
    const badOrganization = await session(ALL_SCOPES, (client) => client["github.botSetup"]({ redirectBase: server.baseUrl, organization: "owner/../settings" }));
    assert.ok(Exit.isFailure(badOrganization));
    const reader = await session(["history:read", "runners:read", "threads:operate"], (client) => client["github.botSetup"]({ redirectBase: server.baseUrl }));
    assert.ok(Exit.isFailure(reader));
    const organization = await session(ALL_SCOPES, (client) => client["github.botSetup"]({ redirectBase: server.baseUrl, organization: "example-org" }));
    assert.ok(Exit.isSuccess(organization) && new URL(organization.value.action).pathname === "/organizations/example-org/settings/apps/new");
  } finally {
    await close();
  }
});
