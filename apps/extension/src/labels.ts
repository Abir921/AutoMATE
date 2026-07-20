/**
 * Figures out what a form field is actually called, the way a person reading
 * the page would - its associated &lt;label&gt;, then aria-label, placeholder,
 * name, or id as fallbacks. This is far more reliable than guessing from a CSS
 * selector after the fact (which is all the server can do), since the DOM here
 * still has the real relationships between labels and fields.
 *
 * Typed to accept any Element (not just native form fields) since every
 * lookup here (labels, aria-*, placeholder, name, id) is equally valid on a
 * contenteditable div - Google Classroom's "Announce something..." box and
 * similar rich-text fields have no native <input>/<textarea> at all.
 */
export function detectFieldLabel(el: Element): string {
  const associated = "labels" in el ? (el as HTMLInputElement).labels : null;
  if (associated && associated.length > 0) {
    const text = associated[0].textContent?.trim();
    if (text) return stripTrailingCountBadge(text);
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return stripTrailingCountBadge(ariaLabel.trim());

  const ariaLabelledBy = el.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const text = document.getElementById(ariaLabelledBy)?.textContent?.trim();
    if (text) return stripTrailingCountBadge(text);
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder?.trim()) return placeholder.trim();

  const name = el.getAttribute("name");
  if (name) return humanize(name);

  if (el.id) return humanize(el.id);

  return "";
}

// Filter-list checkboxes commonly render as one clickable label wrapping both
// the option's name and a match-count badge (e.g. "Free cancellation" + "102"
// as a nested span) - .textContent concatenates both into "Free cancellation
// 102". The count is meta-info about the CURRENT search, not part of the
// field's name, so strip a trailing bare/comma-formatted number off the label.
function stripTrailingCountBadge(text: string): string {
  return text.replace(/\s+[\d][\d,]*$/, "").trim() || text;
}

function humanize(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
