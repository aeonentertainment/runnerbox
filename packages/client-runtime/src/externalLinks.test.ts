import assert from "node:assert/strict";
import { test } from "node:test";
import { loopbackOrigin, opensInBrowser } from "./externalLinks.ts";

test("only https links to github.com and a loopback server's bot setup page leave the app for the browser", () => {
  assert.equal(opensInBrowser("https://github.com/owner/name/actions/runs/5217"), true);
  assert.equal(opensInBrowser("http://127.0.0.1:4517/api/github/bot-setup?state=abc-DEF_123"), true);
  for (const url of [
    "http://github.com/owner/name",
    "https://github.com.example.net/x",
    "https://example.net/?github.com",
    "https://user@github.com/x",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not a url",
    // Loopback, but not the setup page, or the setup page somewhere else.
    "http://127.0.0.1:4517/",
    "http://127.0.0.1:4517/api/github/bot-created?code=x&state=y",
    "http://127.0.0.1:4517/api/github/bot-setup?state=a&next=https://example.net",
    "http://example.net:4517/api/github/bot-setup?state=abc",
    "http://127.0.0.1.example.net:80/api/github/bot-setup?state=abc",
  ]) {
    assert.equal(opensInBrowser(url), false, url);
  }
});

test("a review bot can be set up only for a server reached on this machine's loopback", () => {
  assert.equal(loopbackOrigin("http://127.0.0.1:4517"), "http://127.0.0.1:4517");
  assert.equal(loopbackOrigin("http://localhost:52011/"), "http://localhost:52011");
  for (const url of ["https://relay.example.net/e/abc", "http://192.168.1.20:4517", "http://127.0.0.1.example.net:80", "not a url"]) assert.equal(loopbackOrigin(url), null, url);
});
