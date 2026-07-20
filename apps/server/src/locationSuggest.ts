import { chromium, Locator } from "playwright";
import { Automation, ParameterDef } from "@formautomator/shared";

const NAV_TIMEOUT_MS = 15_000;
const FIELD_PROBE_TIMEOUT_MS = 4_000;
const SUGGESTION_WAIT_MS = 1_500;
const MAX_SUGGESTIONS = 8;

// Common attribute patterns for "search for a place" boxes across
// travel/booking sites, tried when the recorded field has no real CSS
// selector of its own (i.e. it was only ever seen as a URL query param, since
// the search runs via a full page navigation rather than a live update).
const LOCATION_INPUT_SELECTORS = [
  'input[name="ss"]',
  'input[aria-label*="destination" i]',
  'input[aria-label*="where" i]',
  'input[placeholder*="destination" i]',
  'input[placeholder*="going" i]',
  'input[placeholder*="where" i]',
];

// The WAI-ARIA combobox pattern (role=listbox/option) is the standard way to
// mark up an autocomplete dropdown, and covers most real sites without
// needing anything site-specific.
const SUGGESTION_LIST_SELECTORS = ['[role="listbox"] [role="option"]', '[role="option"]', 'ul[role="listbox"] li'];

/**
 * Best-effort: opens the automation's actual starting page in a real headless
 * browser, types into whatever looks like its destination search box, and
 * scrapes the resulting autocomplete suggestions - there's no static list of
 * "every place this site knows about" to search client-side, so this is the
 * only way to offer real suggestions matching the target site's own naming.
 */
export async function suggestLocations(automation: Automation, param: ParameterDef, query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let browser: import("playwright").Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(automation.startUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

    // A param recorded from a real <input> (no urlParam) carries its own
    // reliable selector from the original recording - try that before the
    // generic heuristics below.
    const selectorsToTry = param.urlParam ? LOCATION_INPUT_SELECTORS : [param.selector, ...LOCATION_INPUT_SELECTORS];

    let field: Locator | null = null;
    for (const sel of selectorsToTry) {
      try {
        const locator = page.locator(sel).first();
        await locator.waitFor({ state: "visible", timeout: FIELD_PROBE_TIMEOUT_MS });
        field = locator;
        break;
      } catch {
        // Try the next candidate.
      }
    }
    if (!field) return [];

    await field.click();
    await field.fill("");
    // Real keystrokes (not .fill()) so the site's live-suggestion JS, which
    // typically listens per-keypress, actually fires.
    await field.pressSequentially(trimmed, { delay: 35 });
    await page.waitForTimeout(SUGGESTION_WAIT_MS);

    for (const sel of SUGGESTION_LIST_SELECTORS) {
      const items = page.locator(sel);
      const count = await items.count();
      if (count === 0) continue;
      const texts = (await items.allTextContents()).map((t) => t.trim()).filter(Boolean);
      const deduped = [...new Set(texts)];
      if (deduped.length > 0) return deduped.slice(0, MAX_SUGGESTIONS);
    }
    return [];
  } catch {
    return [];
  } finally {
    await browser?.close();
  }
}
