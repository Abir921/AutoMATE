import type { RecordedStep } from "@formautomator/shared";
import { buildSelectorCandidates } from "./selector";
import { detectFieldLabel } from "./labels";

// This file can end up injected twice into the same frame: once via the
// manifest's static content_scripts entry, and once via the proactive
// chrome.scripting.executeScript call background.ts makes on Start Recording
// (needed so recording also works on tabs that were already open). Without
// this guard, the second injection would register a second set of listeners
// and every real user action would be recorded twice.
const marker = "__formAutomatorRecorderLoaded";
if (!(window as any)[marker]) {
  (window as any)[marker] = true;
  init();
}

function init() {
  let recording = false;
  let toolbar: ReturnType<typeof createToolbar> | null = null;

  chrome.storage.local.get("recording", (state) => {
    setRecording(!!state.recording);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "recording" in changes) {
      setRecording(!!changes.recording.newValue);
    }
  });

  function setRecording(next: boolean) {
    recording = next;
    if (recording && !toolbar) {
      toolbar = createToolbar({
        onStop: () => chrome.runtime.sendMessage({ type: "STOP_RECORDING" }).catch(() => {}),
      });
    } else if (!recording && toolbar) {
      toolbar.destroy();
      toolbar = null;
    }
  }

  function sendStep(step: RecordedStep) {
    chrome.runtime.sendMessage({ type: "RECORD_STEP", step }).catch(() => {
      // Background may not be ready yet (e.g. right after install) - drop silently.
    });
  }

  function isFormField(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
  }

  // Rich-text compose boxes (Google Classroom's "Announce something...",
  // Gmail's body, Google Docs, etc.) are contenteditable divs, not native
  // <input>/<textarea> elements - isFormField() alone misses them entirely,
  // which silently drops the typed text from the recording (replay then
  // clicks "Post"/"Send" on an empty box and still reports success, since
  // the click itself succeeds).
  function isContentEditable(el: Element): boolean {
    return (el as HTMLElement).isContentEditable === true;
  }

  function isOwnUi(el: Element | null): boolean {
    return !!el && el.id === "__formautomator_toolbar_host";
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!recording) return;
      const target = e.target as Element | null;
      if (!target || isOwnUi(target)) return;

      // Form fields fire their own input/change events; recording their clicks
      // too would just add noise since the value events already capture the outcome.
      if (isFormField(target)) return;

      // Clicking anywhere inside a <label> for a checkbox/radio toggles that
      // field natively - the field's own input event (below) already captures
      // the result with a much more reliable selector than whatever deep,
      // structural span/div happened to receive the click inside the label.
      const label = target.closest("label");
      if (label) {
        const forId = label.getAttribute("for");
        const associated = forId ? document.getElementById(forId) : label.querySelector("input");
        const type = associated instanceof HTMLInputElement ? associated.type : "";
        if (type === "checkbox" || type === "radio") return;
      }

      const clickable = target.closest("button, a, [role=button], input[type=submit], input[type=button]") ?? target;
      sendStep({ type: "click", selectors: buildSelectorCandidates(clickable), timestamp: Date.now() });
    },
    true
  );

  // Fires on every keystroke, so the field's value is captured as soon as the
  // user types - we don't rely on blur/commit (a "change" event) ever firing,
  // which many JS-heavy sites don't reliably trigger before the next action.
  // background.ts coalesces repeated "input" steps for the same selector into
  // one step, so this doesn't bloat the recording.
  document.addEventListener(
    "input",
    (e) => {
      if (!recording) return;
      const target = e.target as Element | null;
      if (!target || target.tagName === "SELECT") return;

      if (isContentEditable(target)) {
        // innerText (not textContent) so multi-line announcements/messages
        // keep their line breaks the way the user actually saw them typed.
        sendStep({
          type: "input",
          selectors: buildSelectorCandidates(target),
          value: (target as HTMLElement).innerText,
          inputType: "contenteditable",
          label: detectFieldLabel(target),
          timestamp: Date.now(),
        });
        return;
      }

      if (!isFormField(target)) return;

      const input = target as HTMLInputElement | HTMLTextAreaElement;
      const inputType = (input as HTMLInputElement).type ?? "text";
      // Never record what someone typed into a password field. Login on
      // sites that require it is handled by connecting a captured browser
      // session (see the "Connect login session" flow), not by replaying a
      // typed-in password - so there's no legitimate use for this value, only
      // a risk of it sitting in plaintext in the automation's stored steps.
      if (inputType === "password") return;
      // A checkbox/radio's own "value" attribute is whatever the site put
      // there for its own purposes (booking.com's filter checkboxes carry
      // literal query-string fragments like "fc=2") - what actually matters
      // for replay is just whether it ended up checked or not.
      const isToggle = inputType === "checkbox" || inputType === "radio";
      sendStep({
        type: "input",
        selectors: buildSelectorCandidates(target),
        value: isToggle ? String((input as HTMLInputElement).checked) : input.value,
        // A filter checkbox's own value attribute is the site's URL filter
        // token (booking.com: "mealplan=1") - kept alongside the checked state
        // so replay can apply the filter through the results URL instead of
        // clicking the checkbox on a page that may be bot-walled.
        nativeValue: isToggle ? (input as HTMLInputElement).value : undefined,
        inputType,
        label: detectFieldLabel(input),
        timestamp: Date.now(),
      });
    },
    true
  );

  // <select> elements don't fire "input" in all browsers, so use "change" for them.
  document.addEventListener(
    "change",
    (e) => {
      if (!recording) return;
      const target = e.target as Element | null;
      if (!target || target.tagName !== "SELECT") return;

      const select = target as HTMLSelectElement;
      sendStep({
        type: "change",
        selectors: buildSelectorCandidates(target),
        value: select.value,
        label: detectFieldLabel(select),
        timestamp: Date.now(),
      });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (!recording) return;
      if (e.key !== "Enter") return;
      const target = e.target as Element | null;
      if (!target || !isFormField(target)) return;

      sendStep({ type: "keydown", key: "Enter", selectors: buildSelectorCandidates(target), timestamp: Date.now() });
    },
    true
  );
}

function createToolbar(handlers: { onStop: () => void }) {
  const host = document.createElement("div");
  host.id = "__formautomator_toolbar_host";
  host.style.cssText = "position:fixed; top:12px; right:12px; z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .bar { font-family: system-ui, sans-serif; background:#111827; color:white; padding:8px 10px;
             border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.35); display:flex; align-items:center;
             gap:8px; font-size:13px; }
      .dot { width:8px; height:8px; border-radius:50%; background:#ef4444; flex-shrink:0; animation: pulse 1.2s infinite; }
      @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
      button { font-family: inherit; font-size:12px; padding:6px 10px; border-radius:6px; border:none; cursor:pointer; }
      .stop { background:#dc2626; color:white; }
    </style>
    <div class="bar">
      <span class="dot"></span>
      <span>Recording</span>
      <button class="stop">Stop</button>
    </div>
  `;
  document.documentElement.appendChild(host);

  const stopBtn = shadow.querySelector(".stop") as HTMLButtonElement;
  stopBtn.addEventListener("click", handlers.onStop);

  return {
    destroy() {
      host.remove();
    },
  };
}
