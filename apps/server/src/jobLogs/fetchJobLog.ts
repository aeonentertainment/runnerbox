import { githubHeaders } from "runnerbox/src/github/github-client.ts";

// GitHub answers a log request with a redirect to its storage, signed for a short while. The log is
// followed only there, over https and without the token; or, for a stand-in or GitHub Enterprise,
// back to the API's own origin.
const LOG_HOSTS = [".actions.githubusercontent.com", ".blob.core.windows.net"];
// Of a log larger than this only the end is kept, read as it streams in.
const KEEP_BYTES = 8 * 1024 * 1024;

export type FetchedLog = { readonly kind: "ok"; readonly text: string; readonly cut: boolean } | { readonly kind: "gone" } | { readonly kind: "error" };

const followable = (location: string, apiBase: string) => {
  const url = URL.parse(location);
  if (url === null) return null;
  if (url.origin === new URL(apiBase).origin) return url;
  return url.protocol === "https:" && LOG_HOSTS.some((host) => url.hostname.endsWith(host)) ? url : null;
};

async function tail(response: Response) {
  const chunks: Uint8Array[] = [];
  let kept = 0;
  let dropped = false;
  for await (const chunk of response.body ?? []) {
    chunks.push(chunk);
    kept += chunk.byteLength;
    while (kept - (chunks[0]?.byteLength ?? 0) >= KEEP_BYTES) {
      kept -= chunks.shift()?.byteLength ?? 0;
      dropped = true;
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  // A tail cut by bytes starts partway through a line.
  return { text: dropped ? text.slice(text.indexOf("\n") + 1) : text, cut: dropped };
}

export async function fetchJobLog(apiBase: string, repo: string, jobId: number, token: string, signal: AbortSignal): Promise<FetchedLog> {
  try {
    const asked = await fetch(`${apiBase}/repos/${repo}/actions/jobs/${jobId}/logs`, { headers: githubHeaders(token), redirect: "manual", signal });
    if (asked.status === 404 || asked.status === 410) return { kind: "gone" };
    if (asked.ok) return { kind: "ok", ...(await tail(asked)) };
    const location = asked.status === 302 ? followable(asked.headers.get("location") ?? "", apiBase) : null;
    if (location === null) return { kind: "error" };
    const log = await fetch(location, { redirect: "error", signal });
    if (log.status === 404 || log.status === 410) return { kind: "gone" };
    return log.ok ? { kind: "ok", ...(await tail(log)) } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
