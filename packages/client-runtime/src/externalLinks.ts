// The page a server on this machine serves to start creating its review bot. It has to open in the
// system browser, which is where the owner is signed in to GitHub.
const BOT_SETUP = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}\/api\/github\/bot-setup\?state=[\w-]{1,100}$/;

// The address of a server this machine reaches on loopback, or null for any other. Only such a
// server can have its review bot set up from here.
export function loopbackOrigin(baseUrl: string) {
  try {
    const { origin } = new URL(baseUrl);
    return /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

// Which links the app hands to the system browser: https pages on github.com, such as a run to
// rerun, and a loopback server's review bot setup page. Desktop main enforces it on anything a page
// tries to open, and the web client renders any other link as text, so it never offers one that
// would be refused.
export function opensInBrowser(url: string) {
  if (BOT_SETUP.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}
