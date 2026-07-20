import { WEB_BASE } from "./config";

// Applied as early as possible to minimize the flash from popup.html's
// default (dark) styling to whatever the web app is actually set to.
// chrome.storage is inherently async (no synchronous read API), so a brief
// flash on light mode is unavoidable, but this keeps it as short as
// possible. Falls back to leaving no override - the CSS's own
// prefers-color-scheme block then decides, same as when mode is "system".
chrome.storage.local.get("webThemeMode", (result) => {
  const mode = result.webThemeMode;
  if (mode === "light" || mode === "dark") {
    document.documentElement.dataset.theme = mode;
  }
});

const startBtn = document.getElementById("start") as HTMLButtonElement;
const stopBtn = document.getElementById("stop") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const homeLink = document.getElementById("home-link") as HTMLAnchorElement;
const connectTokenInput = document.getElementById("connect-token") as HTMLInputElement;
const captureBtn = document.getElementById("capture-session") as HTMLButtonElement;
const sessionStatusEl = document.getElementById("session-status") as HTMLDivElement;

homeLink.href = WEB_BASE;
connectTokenInput.focus();

captureBtn.addEventListener("click", async () => {
  sessionStatusEl.textContent = "";
  let connectToken = connectTokenInput.value.trim();
  // Read the clipboard here, inside the click handler, rather than
  // automatically when the popup opens - Chrome requires a real user
  // gesture for clipboard reads, so attempting this on load (no gesture)
  // silently fails every time. A click on this button counts as the gesture.
  if (!connectToken) {
    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();
      if (clipboardText) {
        connectToken = clipboardText;
        connectTokenInput.value = clipboardText;
      }
    } catch {
      // Clipboard read blocked or empty - fall through to the manual-paste message below.
    }
  }
  if (!connectToken) {
    sessionStatusEl.textContent = "Paste the connect code first.";
    return;
  }
  captureBtn.disabled = true;
  sessionStatusEl.textContent = "Capturing...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      sessionStatusEl.textContent = "Couldn't read the current tab's URL.";
      return;
    }
    const result = await chrome.runtime.sendMessage({ type: "CAPTURE_SESSION", connectToken, url: tab.url });
    sessionStatusEl.textContent = result?.ok
      ? "Session captured - you can close this and run the automation."
      : (result?.error ?? "Capture failed.");
    if (result?.ok) connectTokenInput.value = "";
  } catch (err) {
    sessionStatusEl.textContent = err instanceof Error ? err.message : "Could not reach the extension background.";
  } finally {
    captureBtn.disabled = false;
  }
});

function render(recording: boolean, stepCount = 0) {
  startBtn.style.display = recording ? "none" : "block";
  stopBtn.style.display = recording ? "block" : "none";
  statusEl.textContent = recording ? `Recording... ${stepCount} step(s) captured` : "Not recording";
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  render(state?.recording ?? false, state?.stepCount ?? 0);
}

startBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  await chrome.runtime.sendMessage({ type: "START_RECORDING" });
  await refresh();
});

stopBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    if (!result?.ok) {
      errorEl.textContent = result?.error ?? "Could not stop recording - no response from the extension background.";
    } else {
      window.close();
    }
  } catch (err) {
    // The background service worker can be asleep/restarted between messages
    // in MV3; sendMessage then rejects instead of resolving. Without this
    // catch, the click handler throws silently and the button just looks dead
    // - no error shown, no tab opened.
    errorEl.textContent = err instanceof Error ? err.message : "Could not reach the extension background.";
  }
  await refresh();
});

refresh();
setInterval(refresh, 1000);
