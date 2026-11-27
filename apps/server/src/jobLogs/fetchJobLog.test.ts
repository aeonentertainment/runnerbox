import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchJobLog } from "./fetchJobLog.ts";

test("a log follows GitHub's redirect only to its own storage or back to the API, and a missing one reads as gone", async () => {
  const asked: string[] = [];
  const server = createServer((request, response) => {
    asked.push(`${request.url} ${request.headers.authorization ?? "no token"}`);
    if (request.url === "/repos/owner/name/actions/jobs/5/logs") return void response.writeHead(302, { location: `http://127.0.0.1:${port()}/storage/5` }).end();
    if (request.url === "/repos/owner/name/actions/jobs/6/logs") return void response.writeHead(302, { location: "http://example.com/steal" }).end();
    if (request.url === "/storage/5") return void response.writeHead(200).end("2026-11-20T10:00:00Z hello\n");
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = () => {
    const address = server.address();
    return typeof address === "object" && address ? address.port : 0;
  };
  const apiBase = `http://127.0.0.1:${port()}`;
  try {
    const signal = AbortSignal.timeout(5_000);
    assert.deepEqual(await fetchJobLog(apiBase, "owner/name", 5, "token", signal), { kind: "ok", text: "2026-11-20T10:00:00Z hello\n", cut: false });
    assert.deepEqual(await fetchJobLog(apiBase, "owner/name", 6, "token", signal), { kind: "error" });
    assert.deepEqual(await fetchJobLog(apiBase, "owner/name", 7, "token", signal), { kind: "gone" });
    // The storage is asked without the token, and the host that isn't GitHub's is never asked.
    assert.deepEqual(asked, ["/repos/owner/name/actions/jobs/5/logs Bearer token", "/storage/5 no token", "/repos/owner/name/actions/jobs/6/logs Bearer token", "/repos/owner/name/actions/jobs/7/logs Bearer token"]);
  } finally {
    server.close();
  }
});
