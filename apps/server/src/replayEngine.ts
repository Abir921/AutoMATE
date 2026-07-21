import { Browser, chromium, Locator, Page } from "playwright";
import { Automation, CapturedCookie, FailedStep, RecordedStep, ResultItem, RunResult } from "@automate/shared";
import { PREFERENCE_URL_PARAMS, withAppliedValue } from "./stepValues";

const STEP_TIMEOUT_MS = 15_000;
const SELECTOR_PROBE_TIMEOUT_MS = 2_000;

class StepFailure extends Error {
  constructor(public failedStep: FailedStep, message: string) {
    super(message);
  }
}

// Maps a captured chrome.cookies.Cookie shape to what Playwright's
// BrowserContext.addCookies() expects - the field names and a couple of
// value shapes differ slightly (sameSite casing, "no session" representation).
function toPlaywrightCookies(cookies: CapturedCookie[]) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
    expires: c.expirationDate ?? -1,
    sameSite: c.sameSite === "no_restriction" ? ("None" as const) : c.sameSite === "strict" ? ("Strict" as const) : ("Lax" as const),
  }));
}

export async function replayAutomation(
  automation: Automation,
  values: Record<string, string>,
  sessionCookies?: CapturedCookie[] | null
): Promise<RunResult> {
  const started = Date.now();
  const steps = substituteValues(automation.steps, automation.parameters, values);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    // Booking-class sites decide per SESSION whether to serve their real
    // result cards - a flagged context keeps getting the degraded page on
    // every reload, while a brand-new context usually gets the real one. So
    // when a run completes but the result page only ever showed page chrome
    // (see extractResultItems), the whole replay is retried in a fresh
    // context rather than reloading the doomed one.
    const MAX_SESSION_ATTEMPTS = 3;
    let result: RunResult = { success: false, error: "Replay did not run", durationMs: 0 };
    for (let attempt = 1; attempt <= MAX_SESSION_ATTEMPTS; attempt++) {
      const outcome = await replayInFreshContext(browser, automation, steps, sessionCookies ?? null, started);
      result = outcome.result;
      if (!(outcome.result.success && outcome.chromeOnly)) break;
    }
    return result;
  } catch (err) {
    const screenshot = browser ? await captureScreenshot(browser) : undefined;
    // A stored session can go stale (the site logged the user out server-side,
    // or the cookie expired) - when that's possible, point at the fix instead
    // of leaving a bare selector-not-found error.
    const sessionHint = automation.hasLoginSession
      ? " If this site requires you to be logged in, try reconnecting the login session from the automation page."
      : "";
    if (err instanceof StepFailure) {
      return {
        success: false,
        error: err.message + sessionHint,
        failedStep: err.failedStep,
        screenshot,
        durationMs: Date.now() - started,
      };
    }
    return {
      success: false,
      error: (err instanceof Error ? err.message : String(err)) + sessionHint,
      screenshot,
      durationMs: Date.now() - started,
    };
  } finally {
    await browser?.close();
  }
}

async function replayInFreshContext(
  browser: Browser,
  automation: Automation,
  steps: RecordedStep[],
  sessionCookies: CapturedCookie[] | null,
  started: number
): Promise<{ result: RunResult; chromeOnly: boolean }> {
  // A default headless context advertises "HeadlessChrome" in its UA, which
  // makes booking-class sites serve a simplified fallback page that ignores
  // carried preference params entirely (selected_currency stayed GBP no
  // matter what). A standard desktop UA/viewport gets the real page, which
  // honors them. Still headless - only the context's self-description changes.
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-GB",
  });
  // A captured login session (see sessionConnectTokens.ts / the "Connect
  // login session" flow) is loaded into the context before any navigation,
  // so every request - including the "jump straight to the last navigate
  // URL" shortcut below - is already authenticated. This is deliberately
  // NOT a scripted login: the human logged in normally in their own
  // browser, we just replay the resulting cookies.
  if (sessionCookies && sessionCookies.length > 0) {
    await context.addCookies(toPlaywrightCookies(sessionCookies));
  }
  const page = await context.newPage();

    // If the recording ends in a full-page navigation (clicking through a search
    // wizard, then submitting), jump straight to that URL instead of replaying
    // every click that led there. Those setup steps (calendar widgets,
    // autocomplete lists) are the most brittle part of a recording - their exact
    // click targets shift with today's date/state - while the destination URL is
    // what actually encodes the search and is stable to replay directly.
    const lastNavigateIndex = findLastNavigateIndex(steps);
    let startIndex = 0;
    // Tracks the URL we deliberately navigated to (with parameter values already
    // substituted in), as opposed to page.url() at the end of replay - sites like
    // booking.com rewrite the address bar to a shortened canonical URL once their
    // own JS loads, which drops the query params that actually encode the search
    // (group_adults, checkin, etc.), so reading page.url() there would silently
    // discard the user's chosen values.
    let finalUrl = automation.startUrl;
    let hasRecordedNavigate = false;
    if (lastNavigateIndex >= 0 && steps[lastNavigateIndex].url) {
      hasRecordedNavigate = true;
      finalUrl = applyToggleFilters(steps, lastNavigateIndex, steps[lastNavigateIndex].url!);
      finalUrl = carryForwardPreferenceParams(steps, lastNavigateIndex, finalUrl);
      await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
      startIndex = lastNavigateIndex + 1;
    } else {
      await page.goto(automation.startUrl, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
    }

    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];
      // A click immediately followed by an input/change step is almost always
      // one physical click on a custom checkbox/toggle: the click landed on a
      // wrapping label/span (deep, fragile structural selector, no id/aria
      // fallback), and the field's own input event - recorded right after,
      // with a far more reliable selector - already captures the real result.
      // So the click adds nothing but a new way to fail; treat it as
      // best-effort regardless of how it was originally recorded.
      const next = steps[i + 1];
      const isRedundantToggleClick = step.type === "click" && (next?.type === "input" || next?.type === "change");
      await runStep(page, isRedundantToggleClick ? { ...step, optional: true } : step, i);
      if (step.type === "navigate" && step.url) {
        hasRecordedNavigate = true;
        finalUrl = step.url!;
      }
    }

    // Automations with no recorded "navigate" step (e.g. a single-page app like
    // YouTube, where searching is a click + client-side route change rather than
    // a full page load) never get a finalUrl above - read the browser's actual
    // current URL instead, since there's no rewrite-on-load risk without an
    // initial full navigation to a query-string URL.
    if (!hasRecordedNavigate) finalUrl = page.url();

    let output: Record<string, string> | null = null;
    if (automation.outputEnabled && automation.outputFields.length > 0) {
      output = {};
      for (const field of automation.outputFields) {
        output[field.key] = await extractField(page, field.selectors);
      }
    }

    const { items: resultItems, chromeOnly } = await extractResultItems(page);

    // Closed only on this success path: on a thrown error the context (and its
    // page) must stay open so the caller's screenshot capture can see it.
    await context.close();

    return {
      result: {
        success: true,
        output,
        durationMs: Date.now() - started,
        finalUrl,
        resultItems: resultItems.length > 0 ? resultItems : undefined,
      },
      chromeOnly,
    };
}

async function captureScreenshot(browser: Browser): Promise<string | undefined> {
  try {
    const [page] = browser.contexts().flatMap((ctx) => ctx.pages());
    if (!page) return undefined;
    const buffer = await page.screenshot({ type: "jpeg", quality: 40 });
    return buffer.toString("base64");
  } catch {
    return undefined;
  }
}

function findLastNavigateIndex(steps: RecordedStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === "navigate") return i;
  }
  return -1;
}

/**
 * Applies checkbox/radio filter steps to the final URL instead of clicking.
 *
 * Filter checkboxes on search sites carry their URL filter token in the
 * element's value attribute (recorded as nativeValue; booking.com:
 * "mealplan=1") and the site reflects ticked filters in a query param holding
 * a ;-joined token list (booking.com: nflt=mealplan%3D1%3Bclass%3D5). Replay
 * jumps straight to the last recorded URL, so filter steps recorded before it
 * are never executed - their run-time values (the user may have un/re-ticked
 * them in the run form) land here, as token add/removes on that URL. This
 * also sidesteps bot walls entirely: no checkbox ever needs to exist on the
 * replayed page.
 */
function applyToggleFilters(steps: RecordedStep[], lastNavigateIndex: number, finalUrl: string): string {
  let url: URL;
  try {
    url = new URL(finalUrl);
  } catch {
    return finalUrl;
  }

  for (let i = 0; i < lastNavigateIndex; i++) {
    const step = steps[i];
    if (step.type !== "input" || (step.inputType !== "checkbox" && step.inputType !== "radio")) continue;
    const token = step.nativeValue;
    // "on" is the browser default for a checkbox with no value attribute -
    // carries no filter information.
    if (!token || token === "on" || !token.includes("=")) continue;

    const paramName = findFilterParamName(steps, i, lastNavigateIndex, token, url);
    if (!paramName) continue;

    const tokens = (url.searchParams.get(paramName) ?? "").split(";").filter(Boolean);
    const wantChecked = step.value === "true";
    const at = tokens.indexOf(token);
    if (wantChecked && at < 0) tokens.push(token);
    if (!wantChecked && at >= 0) tokens.splice(at, 1);

    if (tokens.length > 0) url.searchParams.set(paramName, tokens.join(";"));
    else url.searchParams.delete(paramName);
  }

  return url.toString();
}

/**
 * Copies sticky preference params (e.g. booking.com's selected_currency) from
 * earlier navigate steps onto the final URL. Picking such a preference during
 * recording puts the param on ONE early URL and then remembers it in a cookie
 * - which the fresh replay browser doesn't have - so without this, replay's
 * jump-to-last-URL shortcut silently reverts the choice to the site default
 * (e.g. prices back in GBP instead of the currency the user picked). The
 * last-seen value wins; a value already on the final URL is left alone.
 */
function carryForwardPreferenceParams(steps: RecordedStep[], lastNavigateIndex: number, finalUrl: string): string {
  let url: URL;
  try {
    url = new URL(finalUrl);
  } catch {
    return finalUrl;
  }

  for (const param of PREFERENCE_URL_PARAMS) {
    if (url.searchParams.has(param)) continue;
    for (let i = lastNavigateIndex - 1; i >= 0; i--) {
      const step = steps[i];
      if (step.type !== "navigate" || !step.url) continue;
      let value: string | null = null;
      try {
        value = new URL(step.url).searchParams.get(param);
      } catch {
        continue;
      }
      if (value) {
        url.searchParams.set(param, value);
        break;
      }
    }
  }

  return url.toString();
}

// A ;-joined list of key=value filter tokens (how nflt-style params look).
const TOKEN_LIST_RE = /^[^;&=]+=[^;&=]+(;[^;&=]+=[^;&=]+)*$/;

/**
 * Which query param holds this filter token? Learned from the recording
 * itself: ticking the box updated the URL (captured as a navigate step), so
 * some later recorded URL contains the token inside one of its params. Falls
 * back to any param on the final URL shaped like a token list, for a filter
 * that was recorded unticked (its token never appeared in any URL).
 */
function findFilterParamName(
  steps: RecordedStep[],
  stepIndex: number,
  lastNavigateIndex: number,
  token: string,
  finalUrl: URL
): string | null {
  for (let j = stepIndex + 1; j <= lastNavigateIndex; j++) {
    const step = steps[j];
    if (step.type !== "navigate" || !step.url) continue;
    let url: URL;
    try {
      url = new URL(step.url);
    } catch {
      continue;
    }
    for (const [name, value] of url.searchParams) {
      if (value.split(";").includes(token)) return name;
    }
  }
  for (const [name, value] of finalUrl.searchParams) {
    if (TOKEN_LIST_RE.test(value)) return name;
  }
  return null;
}

function substituteValues(
  steps: RecordedStep[],
  parameters: Automation["parameters"],
  values: Record<string, string>
): RecordedStep[] {
  const result = steps.map((s) => ({ ...s }));
  for (const param of parameters) {
    const newValue = values[param.key];
    const step = result[param.stepIndex];
    if (newValue === undefined || !step) continue;
    result[param.stepIndex] = withAppliedValue(step, newValue, param.urlParam);
  }
  return result;
}

/** Tries each candidate selector in order (most reliable first) and returns the first that resolves. */
async function resolveLocator(page: Page, selectors: string[] | undefined): Promise<Locator | null> {
  for (const selector of selectors ?? []) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "attached", timeout: SELECTOR_PROBE_TIMEOUT_MS });
      return locator;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function runStep(page: Page, step: RecordedStep, index: number): Promise<void> {
  switch (step.type) {
    case "navigate": {
      if (step.url) {
        await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
      }
      return;
    }
    case "click": {
      const locator = await resolveLocator(page, step.selectors);
      if (!locator) return failOrSkip(step, index);
      await locator.click({ timeout: STEP_TIMEOUT_MS });
      return;
    }
    case "input": {
      const locator = await resolveLocator(page, step.selectors);
      if (!locator) return failOrSkip(step, index);
      if (step.inputType === "checkbox" || step.inputType === "radio") {
        // Recorded as the toggle's checked state (true/false), not text - a
        // checkbox/radio can't be .fill()'d, that only works on text-like fields.
        await locator.setChecked(step.value === "true", { timeout: STEP_TIMEOUT_MS });
      } else {
        // Playwright's .fill() explicitly supports [contenteditable] elements
        // as well as <input>/<textarea> - covers rich-text compose boxes
        // (Gmail body, Google Classroom's "Announce something..." box) the
        // same way as plain fields, with no separate code path needed.
        await locator.fill(step.value ?? "", { timeout: STEP_TIMEOUT_MS });
      }
      return;
    }
    case "change": {
      const locator = await resolveLocator(page, step.selectors);
      if (!locator) return failOrSkip(step, index);
      const tag = await locator.evaluate((el) => el.tagName);
      if (tag === "SELECT") {
        await locator.selectOption(step.value ?? "");
      } else {
        await locator.fill(step.value ?? "", { timeout: STEP_TIMEOUT_MS });
      }
      return;
    }
    case "keydown": {
      if (!step.key) return;
      const locator = await resolveLocator(page, step.selectors);
      try {
        await Promise.all([
          page.waitForNavigation({ timeout: 2_000, waitUntil: "domcontentloaded" }),
          locator ? locator.press(step.key) : page.keyboard.press(step.key),
        ]);
      } catch {
        // No navigation followed the keypress (e.g. SPA) - that's fine.
      }
      return;
    }
  }
}

function failOrSkip(step: RecordedStep, index: number): void {
  if (step.optional) return; // best-effort step (e.g. dismiss a cookie banner) - fine if it's not there.
  throw new StepFailure(
    { index, type: step.type, selectors: step.selectors ?? [] },
    `Step ${index + 1} (${step.type}) couldn't find any of its recorded selectors: ${(step.selectors ?? []).join(", ")}`
  );
}

const STABLE_TEXT_POLL_MS = 400;
const STABLE_TEXT_REQUIRED_MATCHES = 2;
const STABLE_TEXT_MAX_WAIT_MS = 6_000;

async function extractField(page: Page, selectors: string[]): Promise<string> {
  const locator = await resolveLocator(page, selectors);
  if (!locator) return "(not found)";
  return waitForStableText(page, locator);
}

/**
 * Polls the locator's text until it reads the same value on N consecutive
 * polls, to ride out async UI updates (loading placeholders, setTimeout-driven
 * content, fetch callbacks) without knowing the target site's specific timing.
 */
async function waitForStableText(page: Page, locator: Locator): Promise<string> {
  let previous: string | null = null;
  let matches = 0;
  const deadline = Date.now() + STABLE_TEXT_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const current = (await locator.innerText()).trim();
    if (current === previous) {
      matches++;
      if (matches >= STABLE_TEXT_REQUIRED_MATCHES) return current;
    } else {
      matches = 0;
    }
    previous = current;
    await page.waitForTimeout(STABLE_TEXT_POLL_MS);
  }
  return previous ?? "";
}

const RESULT_ITEMS_MAX = 40;
const RESULT_SCRAPE_INTERVAL_MS = 700;
// Real result pages (booking.com with many filters) can client-side redirect
// ~1.5s in and only START rendering cards ~2.5s after domcontentloaded - and
// on bad runs considerably later - so the scrape window must comfortably
// outlast that.
const RESULT_SCRAPE_DEADLINE_MS = 15_000;
// ...but a page with NO list at all (e.g. a form-submission automation) should
// not hold every run hostage for the full deadline.
const RESULT_SCRAPE_EMPTY_GIVE_UP_MS = 5_000;
// Minimum time before a "stable" scrape may end the loop early - stability
// within the first few seconds usually just means the late-rendering parts
// (the actual results) haven't shown up yet.
const RESULT_SCRAPE_MIN_SETTLE_MS = 6_500;

/**
 * Best-effort scrape of "the list of results" on whatever page the automation
 * ended on (search results, listings, etc), so the app can show something
 * organized without the user needing to configure output fields. Result
 * pages on real sites often render asynchronously after the initial
 * navigation, so this retries a few times, keeping the best (most complete)
 * attempt rather than the first. Some sites (booking.com) also client-side
 * redirect again shortly after the initial load - an evaluate mid-redirect
 * throws "execution context destroyed" rather than just returning stale data,
 * so that specific failure waits for the new page to settle and keeps trying
 * instead of giving up on the whole extraction.
 */
// tsx (esbuild) injects `__name(fn, "fn")` calls into transpiled functions to
// preserve .name for stack traces - including this one and its nested helpers.
// Playwright's page.evaluate(fn, arg) serializes fn via fn.toString() and reruns
// it inside the browser, where that injected __name reference doesn't exist,
// throwing "ReferenceError: __name is not defined" on every single call. Strip
// those calls out of the stringified source before sending it to the page.
const SCRAPE_LISTINGS_SOURCE = scrapeListings.toString().replace(/\b__name\([^;]*\);?/g, "");

/**
 * Cards carrying a price or image are what result lists are made of; groups of
 * bare text lines (nav menus, dialog copy) are almost always page chrome that
 * happened to repeat. Weighting rich cards heavily means a real 8-hotel list
 * beats a 30-link nav menu scraped moments earlier.
 */
function scrapeQuality(items: ResultItem[]): number {
  const rich = items.filter((i) => i.price || i.image).length;
  return rich * 4 + (items.length - rich);
}

/**
 * Scrapes the page's result list. `chromeOnly: true` reports the recognizable
 * degraded state where the whole window only ever produced tiny priceless
 * "chrome" groups (language pickers, promo blocks) - the signature of a
 * bot-flagged session that will never render its result cards. The caller
 * (replayAutomation) reacts by retrying the run in a fresh browser context;
 * reloading within the same session was tried first and never recovers.
 */
async function extractResultItems(page: Page): Promise<{ items: ResultItem[]; chromeOnly: boolean }> {
  let best: ResultItem[] = [];
  let bestQuality = 0;
  let previousQuality = -1;
  let stableAttempts = 0;
  let scrollNudged = false;
  const started = Date.now();

  while (Date.now() - started < RESULT_SCRAPE_DEADLINE_MS) {
    try {
      const items = (await page.evaluate(`(${SCRAPE_LISTINGS_SOURCE})(${RESULT_ITEMS_MAX})`)) as ResultItem[];
      const quality = scrapeQuality(items);
      if (quality > bestQuality) {
        best = items;
        bestQuality = quality;
      }
      if (items.length >= RESULT_ITEMS_MAX) break;
      // A list of 5+ mostly-rich cards is a real result set - stop waiting.
      const rich = items.filter((i) => i.price || i.image).length;
      if (items.length >= 5 && rich >= items.length / 2) break;
      // Short lists (a 2-hotel search) never hit the check above - once the
      // page has stopped changing for a few polls, what we have is final.
      // Guarded twice: an elapsed-time floor (chrome renders BEFORE the ~3s+
      // result cards, so early stability lies), and a priced-item requirement
      // (promo/nav blocks never carry prices; real short lists we'd want to
      // lock in almost always do).
      stableAttempts = quality === previousQuality ? stableAttempts + 1 : 0;
      previousQuality = quality;
      const trustworthy = best.some((i) => i.price) || best.length >= 5;
      if (quality > 0 && stableAttempts >= 3 && trustworthy && Date.now() - started > RESULT_SCRAPE_MIN_SETTLE_MS) {
        break;
      }
      // Chrome-only and long-stable: further waiting on THIS load rarely
      // helps - bail so the retry budget goes to a fresh page load instead.
      if (quality > 0 && !trustworthy && stableAttempts >= 6 && Date.now() - started > 8_000) break;
      // One small scroll after the page settles a little - some sites only
      // mount below-the-fold result cards on first scroll activity.
      if (!scrollNudged && Date.now() - started > 1_500) {
        scrollNudged = true;
        await page.evaluate("window.scrollBy(0, 700)").catch(() => {});
      }
    } catch {
      // Mid-redirect (booking.com re-navigates shortly after load) - wait for
      // the new document rather than giving up on the whole extraction.
      await page.waitForLoadState("domcontentloaded", { timeout: STEP_TIMEOUT_MS }).catch(() => {});
      previousQuality = -1;
      stableAttempts = 0;
    }
    if (best.length === 0 && Date.now() - started > RESULT_SCRAPE_EMPTY_GIVE_UP_MS) break;
    await page.waitForTimeout(RESULT_SCRAPE_INTERVAL_MS);
  }

  // If the whole window passed and the best "list" is still tiny and
  // priceless, it's page chrome (language pickers, promo blocks) that slipped
  // past the structural filters - showing nothing (the UI then points at the
  // real result page) beats showing junk cards. Costs us genuine tiny
  // priceless lists, which are far rarer than chrome misfires.
  if (best.length > 0 && best.length <= 3 && !best.some((i) => i.price)) {
    return { items: [], chromeOnly: true };
  }

  return { items: best, chromeOnly: false };
}

/**
 * Runs inside the page (via page.evaluate) - no access to anything outside
 * this function's own scope. Finds the most plausible "repeated result card"
 * structure on the page (grouping siblings by parent + tag + class) and pulls
 * a title/image/link/price/other-detail-lines out of each, generically - this
 * has to work on sites we've never seen, not just booking.com/YouTube.
 */
function scrapeListings(maxItems: number): ResultItem[] {
  function collectAll(root: Document | ShadowRoot, out: Element[]) {
    root.querySelectorAll("*").forEach((el) => {
      out.push(el);
      const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (shadow) collectAll(shadow, out);
    });
  }

  function visibleText(el: Element): string {
    return (el as HTMLElement).innerText?.trim() ?? (el.textContent ?? "").trim();
  }

  function hasImage(el: Element): boolean {
    if (el.querySelector("img[src], img[data-src]")) return true;
    for (const child of Array.from(el.querySelectorAll("*"))) {
      const bg = getComputedStyle(child).backgroundImage;
      if (bg && bg.startsWith("url(")) return true;
    }
    return false;
  }

  const all: Element[] = [];
  collectAll(document, all);

  // Group elements by (parent, tag+className signature) - a real result list
  // is N siblings under the same parent sharing the same structure.
  const groups = new Map<Element, Map<string, Element[]>>();
  for (const el of all) {
    const parent = el.parentElement;
    if (!parent) continue;
    const key = `${el.tagName}|${String(el.className).split(" ").slice(0, 2).join(".")}`;
    let byParent = groups.get(parent);
    if (!byParent) {
      byParent = new Map();
      groups.set(parent, byParent);
    }
    let arr = byParent.get(key);
    if (!arr) {
      arr = [];
      byParent.set(key, arr);
    }
    arr.push(el);
  }

  // Symbols + common ISO codes; must cover whatever currency the user picked
  // for the site, not just the site's default (e.g. ₹ after switching to INR).
  const CURRENCY_RE =
    /(?:[$£€¥₹₪₩₺₫฿₦₴]|BDT|USD|EUR|GBP|INR|ILS|ARS|MYR|SGD|AUD|CAD|NZD|CHF|JPY|CNY|KRW|THB|IDR|PHP|VND|TRY|PLN|SEK|NOK|DKK|AED|SAR|HKD|Tk|RM|Rp|zł|kr|Rs\.?)\s?\d[\d,.]*(?:\.\d+)?/i;
  const NOISE_LINE_RE = /^(show more|read more|see availability|book now|reserve|save|share|see photos?|view deal|sold out)$/i;

  let bestGroup: Element[] = [];
  let bestScore = 0;
  for (const byParent of groups.values()) {
    for (const candidates of byParent.values()) {
      // A heavily-filtered search can legitimately return just 2 results -
      // requiring 3+ made those pages scrape nav menus instead of the real
      // (but short) result list. Random 2-element sibling pairs are kept out
      // by the length/image scoring below, not by a hard minimum.
      if (candidates.length < 2 || candidates.length > 80) continue;
      // Page chrome is never the result list: language pickers and account
      // menus live in nav/header/footer, and cookie/review prompts live in
      // dialogs - all of them repeat just like result cards do, and on a page
      // whose real list is short they can otherwise outscore it.
      if (
        candidates[0].closest(
          "nav, header, footer, dialog, [role='dialog'], [aria-modal='true'], [role='banner'], [role='navigation'], [role='contentinfo']"
        )
      )
        continue;
      const sample = candidates.slice(0, 5);
      const avgLen = sample.reduce((sum, el) => sum + visibleText(el).length, 0) / sample.length;
      if (avgLen < 12 || avgLen > 600) continue; // too sparse (icons) or too dense (whole page)
      const baseScore = candidates.length * Math.min(avgLen, 150);
      // Real result cards (hotels, videos, products) almost always carry a
      // thumbnail; text-only lists that happen to repeat (nav links, related-
      // destination carousels) shouldn't outrank them just for being longer.
      const imageRatio = sample.filter(hasImage).length / sample.length;
      const score = baseScore * (0.4 + imageRatio * 1.6);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = candidates;
      }
    }
  }

  const items: ResultItem[] = [];
  const seen = new Set<string>();
  for (const el of bestGroup) {
    if (items.length >= maxItems) break;

    const titleEl =
      el.querySelector("h1,h2,h3,h4,h5,h6") ??
      el.querySelector('[class*="title" i],[id*="title" i]') ??
      el.querySelector("a");
    let title = titleEl ? visibleText(titleEl) : "";
    if (!title) {
      let longest = "";
      el.querySelectorAll("*").forEach((leaf) => {
        if (leaf.children.length > 0) return;
        const t = visibleText(leaf);
        if (t.length > longest.length && t.length < 140) longest = t;
      });
      title = longest;
    }
    title = title.slice(0, 140).trim();
    if (!title) continue;

    let image: string | undefined;
    const img = el.querySelector("img[src], img[data-src]") as HTMLImageElement | null;
    if (img) {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || undefined;
      image = src && src.startsWith("data:") && src.length < 200 ? undefined : src ?? undefined;
    }
    if (!image) {
      el.querySelectorAll("*").forEach((child) => {
        if (image) return;
        const bg = getComputedStyle(child).backgroundImage;
        const match = bg && /url\((['"]?)(.*?)\1\)/.exec(bg);
        if (match) image = match[2];
      });
    }
    if (image && image.startsWith("//")) image = `https:${image}`;

    const fullText = visibleText(el);
    const priceMatch = fullText.match(CURRENCY_RE);
    const price = priceMatch ? priceMatch[0] : undefined;

    // Everything else short and distinct on the card - rating, review count,
    // neighborhood/location, distance, etc - shown as-is rather than guessing
    // which one is "the" subtitle, since that varies wildly by site.
    const details: string[] = [];
    const detailSeen = new Set<string>();
    for (const raw of fullText.split("\n")) {
      if (details.length >= 4) break;
      const line = raw.trim();
      if (!line || line === title || line === price || line.length > 100) continue;
      if (NOISE_LINE_RE.test(line)) continue;
      if (detailSeen.has(line)) continue;
      detailSeen.add(line);
      details.push(line);
    }

    let link = titleEl?.closest("a[href]") ?? null;
    if (link && !el.contains(link)) link = null;
    if (!link) link = el.querySelector("a[href]");
    if (!link && el.tagName === "A") link = el;
    let url: string | undefined;
    if (link) {
      const href = (link as HTMLAnchorElement).href;
      if (href && href.startsWith("http")) url = href;
    }

    const dedupeKey = `${title}|${url ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({ title, price, details: details.length > 0 ? details : undefined, image, url });
  }

  return items;
}
