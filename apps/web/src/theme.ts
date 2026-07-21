export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "automate_theme";
const CYCLE: ThemeMode[] = ["system", "light", "dark"];

/**
 * Dispatched on `window` whenever the user's theme choice changes, so the
 * AutoMATE browser extension - which can't read this page's
 * localStorage from its own popup (different origin) - can pick up live
 * changes via its content-script bridge (extension/src/themeBridge.ts).
 * That bridge also reads localStorage directly on injection, so the popup
 * stays correct even if it's opened before any toggle click fires this.
 */
export const THEME_SYNC_EVENT = "automate-theme-change";

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function nextThemeMode(current: ThemeMode): ThemeMode {
  return CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
}

export function setThemeMode(mode: ThemeMode): void {
  if (mode === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, mode);
  applyThemeMode(mode);
}

/**
 * "system" removes the attribute so the prefers-color-scheme block in
 * styles.css takes over - OS theme changes then apply live with no JS.
 * A short-lived class fades colors during the switch instead of an abrupt
 * flash; skipped entirely when the user prefers reduced motion.
 */
export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-fade");
    window.setTimeout(() => root.classList.remove("theme-fade"), 350);
  }

  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;

  window.dispatchEvent(new CustomEvent(THEME_SYNC_EVENT, { detail: { mode } }));
}
