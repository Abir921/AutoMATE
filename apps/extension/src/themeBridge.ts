// Injected only into the AutoMATE web app itself (manifest.json scopes
// this to WEB_BASE's origin, unlike content.ts's recorder which runs
// everywhere). The popup can't read this page's localStorage directly - it's
// a different origin (chrome-extension://<id> vs the web app's own) - so this
// bridge relays the user's theme choice into chrome.storage, which both
// contexts can access.
const STORAGE_KEY = "automate_theme";
const THEME_SYNC_EVENT = "automate-theme-change";

type ThemeMode = "light" | "dark" | "system";

function currentModeFromLocalStorage(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function syncMode(mode: ThemeMode) {
  chrome.storage.local.set({ webThemeMode: mode });
}

// Covers the popup being opened before any toggle click ever fires the event
// below - e.g. right after the web app loads with a previously saved choice.
syncMode(currentModeFromLocalStorage());

// Covers live changes: the user clicks the theme toggle while this tab is open.
window.addEventListener(THEME_SYNC_EVENT, (e) => {
  const mode = (e as CustomEvent<{ mode: ThemeMode }>).detail?.mode;
  if (mode) syncMode(mode);
});
