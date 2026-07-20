/**
 * Builds an ordered list of candidate selectors for `el`, most reliable first.
 * Real sites (React/Vue apps, A/B tests, redesigns) frequently regenerate class
 * names and even ids between when a workflow is recorded and when it's replayed,
 * so recording just ONE selector makes automations brittle. Replay tries each
 * candidate in order and uses the first one that resolves.
 */
export function buildSelectorCandidates(el: Element): string[] {
  const candidates: string[] = [];
  const tag = el.tagName.toLowerCase();

  if (el.id && !isEphemeralFrameworkId(el.id)) {
    const sel = `#${CSS.escape(el.id)}`;
    if (isUnique(sel)) candidates.push(sel);
  }

  const name = el.getAttribute("name");
  if (name) {
    const sel = `${tag}[name="${escapeAttrValue(name)}"]`;
    if (isUnique(sel)) candidates.push(sel);
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const sel = `${tag}[aria-label="${escapeAttrValue(ariaLabel)}"]`;
    if (isUnique(sel)) candidates.push(sel);
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) {
    const sel = `${tag}[placeholder="${escapeAttrValue(placeholder)}"]`;
    if (isUnique(sel)) candidates.push(sel);
  }

  // A checkbox/radio's own id/name rarely stays stable across redesigns (or
  // is a framework-generated id that's excluded above), but its <label>'s
  // visible text usually survives changes that break every structural or
  // positional selector. A label can be associated with its field two ways -
  // wrapping it, or via for="id" as a sibling elsewhere in the tree - so
  // build a selector matching whichever relationship this field actually
  // uses (native .labels covers both, the same way the browser itself
  // resolves label clicks).
  if (tag === "input") {
    const associatedLabel = "labels" in el ? (el as HTMLInputElement).labels?.[0] : undefined;
    if (associatedLabel) {
      const text = (associatedLabel.textContent || "").trim().replace(/\s+/g, " ");
      const cleaned = text.replace(/\s+[\d][\d,]*$/, "").trim();
      if (cleaned && cleaned.length <= 80) {
        const escaped = cleaned.replace(/"/g, '\\"');
        candidates.push(
          associatedLabel.contains(el)
            ? `label:has-text("${escaped}") input`
            : `xpath=//label[contains(normalize-space(.), "${escaped}")]/following::input[1]`
        );
      }
    }
  }

  // Text-based match: great for buttons/links whose class/id churns across deploys
  // but whose visible label stays stable. This uses Playwright's `:text()` selector
  // syntax, which isn't valid standard CSS, so we can't verify uniqueness with
  // document.querySelectorAll here - it's included unconditionally as a fallback
  // and Playwright resolves it for real at replay time.
  const text = (el.textContent || "").trim().replace(/\s+/g, " ");
  const isTextCarrier = tag === "button" || tag === "a" || el.getAttribute("role") === "button";
  if (text && text.length <= 60 && isTextCarrier) {
    candidates.push(`${tag}:text("${text.replace(/"/g, '\\"')}")`);
  }

  // Structural path - always available, least resilient to markup changes.
  candidates.push(buildStructuralPath(el));

  return candidates;
}

function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

// React's useId() produces ids like ":r11:" / ":rt:" / ":rcl:" - deliberately
// colon-wrapped so they can never collide with author-written ids, and
// deliberately NOT stable across page loads: the counter is assigned by
// render order, which shifts with A/B tests, feature flags, or unrelated
// upstream conditional rendering. Trusting it as a selector means confidently
// pointing at the wrong (or no) element next time the page renders.
function isEphemeralFrameworkId(id: string): boolean {
  return /^:.+:$/.test(id);
}

function escapeAttrValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

function buildStructuralPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; node && depth < 6 && node !== document.body; depth++) {
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTag = node.tagName;
    const siblings: Element[] = Array.from(parent.children).filter((c) => c.tagName === currentTag);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);

    const partial = parts.join(" > ");
    if (isUnique(partial)) return partial;

    node = parent;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}
