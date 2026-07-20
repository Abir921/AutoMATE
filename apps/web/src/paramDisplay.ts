// Display-only fixes for parameters that were recorded with a raw, technical
// name/value (e.g. booking.com's "nflt" aggregate filter param). Purely
// cosmetic - the underlying value round-trips into the URL unchanged at run
// time - which is what lets this fix ALREADY-CREATED automations retroactively
// (their stored ParameterDef.label can't be changed after creation, but how
// it's rendered here can be).

// Small, targeted list - only urlParams known to render badly raw. Mirrors
// the server's FRIENDLY_PARAM_LABELS entry for the same key (paramDetect.ts),
// which only helps FUTURE recordings; this is the retroactive counterpart.
const FRIENDLY_URLPARAM_LABELS: Record<string, string> = {
  nflt: "Filters",
};

export function displayLabel(param: { label: string; urlParam?: string }): string {
  const friendly = param.urlParam && FRIENDLY_URLPARAM_LABELS[param.urlParam.toLowerCase()];
  return friendly ?? param.label;
}

// Shape of a ;-joined key=value filter token list (booking.com's nflt:
// "entire_place_bedroom_count=2;stay_type=1;min_bathrooms=2"). Same shape
// replayEngine.ts's TOKEN_LIST_RE recognizes server-side for filter-checkbox
// URL editing.
const TOKEN_LIST_RE = /^[^;&=]+=[^;&=]+(;[^;&=]+=[^;&=]+)*$/;

function humanizeKey(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Breaks a token-list value into a readable summary ("Entire Place Bedroom
 * Count: 2, Stay Type: 1, Min Bathrooms: 2"), or null if the value isn't
 * shaped like one (plain text/numbers pass through untouched elsewhere).
 */
export function humanizeTokenListValue(value: string): string | null {
  if (!TOKEN_LIST_RE.test(value)) return null;
  return value
    .split(";")
    .map((token) => {
      const [key, val] = token.split("=");
      return `${humanizeKey(key)}: ${val}`;
    })
    .join(", ");
}
