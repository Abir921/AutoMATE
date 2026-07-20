import { useState } from "react";
import { getThemeMode, nextThemeMode, setThemeMode, type ThemeMode } from "../theme";

const LABELS: Record<ThemeMode, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 17v3.5" />
    </svg>
  );
}

/** Cycles System -> Light -> Dark. The choice persists in localStorage. */
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());

  function cycle() {
    const next = nextThemeMode(mode);
    setThemeMode(next);
    setMode(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={`${LABELS[mode]} - click to change`}
      aria-label={`${LABELS[mode]} - click to change`}
    >
      {mode === "light" ? <SunIcon /> : mode === "dark" ? <MoonIcon /> : <SystemIcon />}
      <span className="theme-toggle-label">{mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
