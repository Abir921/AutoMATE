import type { RecordedStep } from "@automate/shared";
import { API_BASE, WEB_BASE } from "./config";

interface DraftOutputField {
  key: string;
  label: string;
  selectors: string[];
}

interface RecordingState {
  recording: boolean;
  steps: RecordedStep[];
  outputFields: DraftOutputField[];
  startUrl: string;
  recordingTabId: number | null;
}

async function getState(): Promise<RecordingState> {
  const stored = await chrome.storage.local.get([
    "recording",
    "steps",
    "outputFields",
    "startUrl",
    "recordingTabId",
  ]);
  return {
    recording: !!stored.recording,
    steps: stored.steps ?? [],
    outputFields: stored.outputFields ?? [],
    startUrl: stored.startUrl ?? "",
    recordingTabId: stored.recordingTabId ?? null,
  };
}

async function setState(partial: Partial<RecordingState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true; // keep the message channel open for the async response
});

async function handleMessage(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message?.type) {
    case "START_RECORDING":
      return startRecording();
    case "STOP_RECORDING":
      return stopRecording();
    case "GET_STATE":
      return reportState();
    case "RECORD_STEP":
      return recordStep(message.step as RecordedStep, sender);
    case "CAPTURE_SESSION":
      return captureSession(message as { connectToken: string; url: string });
    case "ADD_OUTPUT_FIELD":
      return addOutputField(message.field as { label: string; selectors: string[] }, sender);
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function startRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await setState({
    recording: true,
    steps: [],
    outputFields: [],
    startUrl: tab?.url ?? "",
    recordingTabId: tab?.id ?? null,
  });
  // The manifest's static content_scripts entry only attaches on future navigations.
  // Inject immediately so recording also works on a tab that's already open.
  if (tab?.id) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {
      // Restricted page (chrome://, Web Store, etc.) - nothing we can do there.
    }
  }
  return { ok: true };
}

async function stopRecording() {
  const state = await getState();
  await setState({ recording: false });
  if (!state.startUrl || state.steps.length === 0) {
    return { ok: false, error: "Nothing was recorded." };
  }
  try {
    const draftId = await submitDraft(state.startUrl, state.steps, state.outputFields);
    await chrome.tabs.create({ url: `${WEB_BASE}/review/${draftId}` });
    return { ok: true, draftId };
  } catch (err) {
    // Most likely cause: the AutoMATE server isn't running. Without this
    // catch, the error would propagate out of this handler and the popup's
    // sendMessage call would hang with no response - no tab opens, no error
    // shown, and it just looks like Stop Recording silently did nothing.
    return {
      ok: false,
      error: `Couldn't reach the AutoMATE server at ${API_BASE}. Is it running? (${
        err instanceof Error ? err.message : String(err)
      })`,
    };
  }
}

async function reportState() {
  const state = await getState();
  return { recording: state.recording, stepCount: state.steps.length };
}

async function recordStep(incoming: RecordedStep, sender: chrome.runtime.MessageSender) {
  const state = await getState();
  if (!state.recording) return { ok: false };
  if (sender.tab?.id !== state.recordingTabId) return { ok: false }; // ignore other tabs

  const steps = [...state.steps];
  const last = steps[steps.length - 1];
  // While the user is still typing into the same field, keep updating one
  // step instead of appending per keystroke (input fires on every keystroke).
  const coalesce =
    (incoming.type === "input" || incoming.type === "change") &&
    last?.type === incoming.type &&
    last.selectors?.[0] === incoming.selectors?.[0];

  if (coalesce) {
    steps[steps.length - 1] = incoming;
  } else {
    steps.push(incoming);
  }

  await setState({ steps });
  return { ok: true };
}

async function captureSession({ connectToken, url }: { connectToken: string; url: string }) {
  const cookies = await chrome.cookies.getAll({ url });
  const res = await fetch(`${API_BASE}/automations/session/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectToken,
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
        hostOnly: c.hostOnly,
      })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error ?? `Capture failed (${res.status})` };
  return { ok: true };
}

async function addOutputField(field: { label: string; selectors: string[] }, sender: chrome.runtime.MessageSender) {
  const state = await getState();
  if (!state.recording) return { ok: false };
  if (sender.tab?.id !== state.recordingTabId) return { ok: false };

  const key = slugify(field.label, state.outputFields.length);
  await setState({ outputFields: [...state.outputFields, { key, label: field.label, selectors: field.selectors }] });
  return { ok: true };
}

function slugify(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `field_${index + 1}`;
}

// Track full-page navigations on the tab being recorded so replay can follow
// the same multi-page journey (e.g. clicking a link that loads a new page).
chrome.webNavigation.onCommitted.addListener((details) => recordNavigation(details));

// Also track pushState/replaceState URL updates. Search sites apply filters
// without a page load but reflect them in the URL (booking.com adds
// nflt=mealplan%3D1 when "Breakfast included" is ticked) - capturing these
// means the recording's final navigate step carries the full filtered URL,
// which replay can jump to directly instead of re-clicking filter widgets.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => recordNavigation(details));

async function recordNavigation(details: { frameId: number; tabId: number; url: string }): Promise<void> {
  if (details.frameId !== 0) return;
  const state = await getState();
  if (!state.recording || details.tabId !== state.recordingTabId) return;
  if (state.steps.length === 0 && details.url === state.startUrl) return; // initial load, not a step

  const last = state.steps[state.steps.length - 1];
  if (last?.type === "navigate" && last.url === details.url) return; // dedupe

  await setState({ steps: [...state.steps, { type: "navigate", url: details.url, timestamp: Date.now() }] });
}

async function submitDraft(startUrl: string, steps: RecordedStep[], outputFields: DraftOutputField[]): Promise<string> {
  const res = await fetch(`${API_BASE}/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startUrl, steps, outputFields }),
  });
  if (!res.ok) throw new Error(`Failed to submit recording: ${res.status}`);
  const data = await res.json();
  return data.id as string;
}
