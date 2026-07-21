import { ParameterCandidate, RecordedStep } from "@automate/shared";
import { PREFERENCE_URL_PARAMS } from "./stepValues";

// Generic tracking/session param names seen across many sites - not worth
// surfacing as "changeable" clutter. Not a blocklist for any one site; these
// are conventional analytics/session keys used web-wide.
const NOISE_PARAMS = new Set([
  "sid", "aid", "label", "lang", "sb", "src", "src_elem", "ref", "session", "token", "gclid", "fbclid", "efdco",
]);

// Internal identifiers that ride alongside a human-readable field (e.g. ss=
// "Dhaka, Bangladesh" plus dest_id=-2737683 for the same place). Editing the
// id/type alone means nothing to a user, and editing the text field without
// it usually wouldn't even change results - so it's left baked at its
// recorded value rather than surfaced as something to change.
const INTERNAL_SUFFIXES = ["_id", "_type", "_code"];

// Friendly names for query-string keys common across search/booking sites.
// Falls back to humanizing the raw key for anything not listed here.
const FRIENDLY_PARAM_LABELS: Record<string, string> = {
  ss: "Destination",
  destination: "Destination",
  location: "Location",
  q: "Search Query",
  query: "Search Query",
  checkin: "Check-in Date",
  checkout: "Check-out Date",
  check_in: "Check-in Date",
  check_out: "Check-out Date",
  group_adults: "Adults",
  adults: "Adults",
  group_children: "Children",
  children: "Children",
  no_rooms: "Rooms",
  rooms: "Rooms",
  guests: "Guests",
  selected_currency: "Currency",
  nflt: "Filters",
};

/**
 * Two sources of changeable values:
 *  1. Any input/change step - a real form field the user typed/selected into.
 *  2. Query-string parameters on a navigate step - click-driven sites (custom
 *     date pickers, autocomplete lists, no native form fields at all) still
 *     put the actual search state into the URL once the search runs, so this
 *     is often the ONLY way to detect what's changeable on those sites.
 * Clicks themselves (buttons, calendar cells, list items) are treated as
 * fixed procedure, not parameters - there's no generic way to "change" a click.
 */
export function detectParameterCandidates(steps: RecordedStep[]): ParameterCandidate[] {
  const candidates: ParameterCandidate[] = [];

  // Filter tokens carried by recorded checkbox/radio steps (booking.com:
  // "mealplan=1"), plus dropdown/select-driven filters whose OWN value is
  // already a token (e.g. a "Bedrooms" <select> with value "entire_place_
  // bedroom_count=2"). The URL param that aggregates them (nflt=...) must not
  // be surfaced as its own changeable field - these controls ARE its UI.
  const toggleTokens = new Set(
    steps
      .filter(
        (s) =>
          (s.type === "input" && (s.inputType === "checkbox" || s.inputType === "radio")) ||
          s.type === "change"
      )
      .flatMap((s) => [s.nativeValue, s.value])
      .filter((v): v is string => !!v && v !== "on" && v.includes("="))
  );

  // Only the LAST navigate step's query params matter: replay jumps straight
  // to that URL, so a param bound to any earlier navigate would be silently
  // ignored at run time. (History-state capture also records one navigate per
  // filter click - scanning them all would duplicate every param N times.)
  const lastNavigateIndex = steps.reduce((last, s, i) => (s.type === "navigate" ? i : last), -1);

  steps.forEach((step, stepIndex) => {
    // Defense-in-depth: the extension no longer records password values at
    // all (content.ts), but an older recording could still have one sitting
    // in steps_json - never surface it as an editable "sample value".
    if (step.type === "input" && step.inputType === "password") return;
    if ((step.type === "input" || step.type === "change") && step.selectors?.length && step.value) {
      const suggestedLabel = suggestLabel(step);
      candidates.push({
        selector: step.selectors[0],
        stepIndex,
        sampleValue: step.value,
        inputType: isLocationField(suggestedLabel) ? "location" : step.inputType,
        suggestedLabel,
      });
    }

    if (step.type === "navigate" && step.url && stepIndex === lastNavigateIndex) {
      let url: URL;
      try {
        url = new URL(step.url);
      } catch {
        return;
      }
      // Some sites (booking.com) repeat the same query key twice in one URL -
      // without this, forEach visits it twice and produces two identical
      // candidate rows for one field.
      const seenKeys = new Set<string>();
      url.searchParams.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (seenKeys.has(lower)) return;
        seenKeys.add(lower);
        if (!value || NOISE_PARAMS.has(lower) || lower.startsWith("utm_")) return;
        if (INTERNAL_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return;
        if (value.split(";").some((token) => toggleTokens.has(token))) return;
        const suggestedLabel = FRIENDLY_PARAM_LABELS[lower] ?? humanize(key);
        candidates.push({
          selector: `navigate[${stepIndex}] ?${key}`,
          stepIndex,
          sampleValue: value,
          inputType: isLocationField(suggestedLabel, key) ? "location" : inferInputType(value),
          suggestedLabel,
          urlParam: key,
        });
      });
    }
  });

  // Sticky preference params (currency picker etc.) usually appear only on an
  // EARLY navigate URL - the site remembers them in a cookie afterwards, so
  // the final URL scanned above doesn't carry them. Surface the last-seen
  // value as changeable, bound to the step where it appeared; replay's
  // carry-forward (replayEngine.ts) propagates it onto the final URL.
  if (lastNavigateIndex >= 0) {
    const lastNavigateParams = tryGetSearchParams(steps[lastNavigateIndex].url);
    for (const param of PREFERENCE_URL_PARAMS) {
      if (lastNavigateParams?.has(param)) continue; // already surfaced by the scan above
      for (let i = lastNavigateIndex - 1; i >= 0; i--) {
        const step = steps[i];
        if (step.type !== "navigate" || !step.url) continue;
        const value = tryGetSearchParams(step.url)?.get(param);
        if (!value) continue;
        candidates.push({
          selector: `navigate[${i}] ?${param}`,
          stepIndex: i,
          sampleValue: value,
          // The run form renders a currency dropdown for this - a free-text box
          // showing a bare ISO code ("ARS") is too easy to leave on whatever
          // the user happened to click while recording.
          inputType: param === "selected_currency" ? "currency" : undefined,
          suggestedLabel: FRIENDLY_PARAM_LABELS[param] ?? humanize(param),
          urlParam: param,
        });
        break;
      }
    }
  }

  return candidates;
}

function tryGetSearchParams(url: string | undefined): URLSearchParams | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams;
  } catch {
    return null;
  }
}

function suggestLabel(step: RecordedStep): string {
  // The recorder detects the field's real <label>/aria-label/placeholder text
  // in the page itself - far more reliable than guessing from a selector here.
  if (step.label?.trim()) return stripTrailingCountBadge(step.label.trim());
  if (step.inputType === "date") return "Date";
  if (step.inputType === "email") return "Email";
  if (step.inputType === "number") return "Number";
  const selector = step.selectors?.[0] || "";
  const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) return humanize(idMatch[1]);
  const nameMatch = selector.match(/\[name=['"]?([a-zA-Z0-9_-]+)['"]?\]/);
  if (nameMatch) return humanize(nameMatch[1]);
  return "Value";
}

// Defense-in-depth mirror of the extension's own stripping (labels.ts) - covers
// drafts recorded with an older extension build that predates that fix, where
// a filter checkbox's label still carries its match-count badge glued on
// (e.g. "Free cancellation 102").
function stripTrailingCountBadge(text: string): string {
  return text.replace(/\s+[\d][\d,]*$/, "").trim() || text;
}

// Common key/label patterns for "search for a place" fields across
// travel/booking/real-estate sites - these get a live destination-suggestion
// dropdown in the run form instead of a plain text box, since typing the
// exact expected place name (matching the target site's own naming/spelling)
// is the single hardest part of reusing one of these automations.
const LOCATION_FIELD_KEYS = new Set(["ss", "destination", "location", "city", "where"]);
function isLocationField(label: string, rawKey?: string): boolean {
  if (rawKey && LOCATION_FIELD_KEYS.has(rawKey.toLowerCase())) return true;
  return /destination|location/i.test(label);
}

// Query-string values carry no HTML input type of their own (there's no real
// <input> behind them - the URL itself is the only source of state on
// click-driven sites), so infer one from the value's shape. This drives
// which native picker the run form shows (calendar for dates, steppers for
// numbers) instead of everything defaulting to a plain text box.
function inferInputType(value: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  if (/^\d+$/.test(value)) return "number";
  return undefined;
}

function humanize(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
