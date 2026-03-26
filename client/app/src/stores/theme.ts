/**
 * Theme store — manages light/dark mode preference.
 *
 * - Persists to localStorage as "gamma-theme" ("dark" | "light")
 * - Falls back to system preference (prefers-color-scheme)
 * - Toggles "light" class on <html> element
 */
import { writable } from "svelte/store";

export type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  const stored = localStorage.getItem("gamma-theme") as Theme | null;
  if (stored === "dark" || stored === "light") return stored;

  // Fall back to system preference
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "light") {
    html.classList.add("light");
  } else {
    html.classList.remove("light");
  }
}

const initial = getInitialTheme();
applyTheme(initial);

export const theme = writable<Theme>(initial);

/** Subscribe to keep DOM and localStorage in sync. */
theme.subscribe((value) => {
  applyTheme(value);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("gamma-theme", value);
  }
});

/** Convenience toggle function. */
export function toggleTheme(): void {
  theme.update((t) => (t === "dark" ? "light" : "dark"));
}

/** Convenience: true when in dark mode. */
export const isDark = {
  subscribe(fn: (value: boolean) => void) {
    return theme.subscribe((t) => fn(t === "dark"));
  },
};
