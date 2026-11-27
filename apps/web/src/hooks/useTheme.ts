import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
export const THEMES: ReadonlyArray<readonly [Theme, string]> = [
  ["dark", "Dark"],
  ["light", "Light"],
  ["system", "Match the system"],
];

const STORAGE_KEY = "runnerbox:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
// The owner's standing choice: dark until someone picks otherwise.
const DEFAULT_THEME: Theme = "dark";

const listeners = new Set<() => void>();
const isTheme = (value: string | null): value is Theme => value === "system" || value === "light" || value === "dark";

// Storage can be missing or refuse, as in a private window: the default stands then.
function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const systemDark = () => typeof window.matchMedia === "function" && window.matchMedia(MEDIA_QUERY).matches;

// As T3 Code's: transitions are held for a frame, so switching doesn't animate every colour.
function applyTheme(theme: Theme = readTheme()) {
  const root = document.documentElement;
  root.classList.add("no-transitions");
  root.classList.toggle("dark", theme === "dark" || (theme === "system" && systemDark()));
  requestAnimationFrame(() => root.classList.remove("no-transitions"));
}

const changed = () => {
  applyTheme();
  for (const listener of listeners) listener();
};

// Applies the picked theme now, and again when another window picks one or the system switches,
// for as long as the app runs.
export function startTheme() {
  applyTheme();
  window.addEventListener("storage", changed);
  window.matchMedia?.(MEDIA_QUERY).addEventListener("change", changed);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not kept, but still shown until the window closes.
  }
  applyTheme(theme);
  for (const listener of listeners) listener();
}

// The picked theme, kept in this browser, following another window's pick and the system's.
export function useTheme() {
  return useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
}
