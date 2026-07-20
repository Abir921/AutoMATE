import { ParameterDef } from "@formautomator/shared";

// MIRROR NOTE: apps/web/src/validation.ts implements these exact same rules
// for inline run-form errors - keep the two in sync. (They can't share one
// module: packages/shared compiles to CommonJS, which the browser can't
// runtime-import - same constraint that put CURRENCY_OPTIONS in the web app.)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Za-z]{3}$/;
// Every number field this app exposes is a small count (adults, rooms,
// children, age, pets, bedrooms...) - real values are at most 2-3 digits.
// 9999 is a generous ceiling that still catches an accidental/garbage paste
// like "234234234" without risking false positives on any legitimate count.
const NUMBER_RE = /^\d{1,4}$/;

/** True only for a real calendar date - rejects shapes like 2026-02-31. */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isPastDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(y, m - 1, d) < today;
}

/** One parameter's problem in plain words, or null if the value is fine. */
export function validateParamValue(param: ParameterDef, rawValue: string | undefined): string | null {
  const value = (rawValue ?? "").trim();
  if (!value) return `${param.label} is required.`;

  switch (param.type) {
    case "number":
      return NUMBER_RE.test(value) ? null : `${param.label} must be a realistic whole number (0-9999).`;
    case "date":
      if (!isRealDate(value)) return `${param.label} must be a valid date.`;
      if (isPastDate(value)) return `${param.label} is in the past.`;
      return null;
    case "currency":
      return CURRENCY_RE.test(value) ? null : `${param.label} must be a 3-letter currency code.`;
    case "checkbox":
      return value === "true" || value === "false" ? null : `${param.label} must be checked or unchecked.`;
    default:
      // text / location: any non-empty string is legitimate.
      return null;
  }
}

/**
 * Checks every submitted value against its parameter's type. Returns one
 * combined human-readable message naming each problem field, or null when
 * everything is valid. Called before the replay browser is launched, so bad
 * input costs a 400 instead of a Playwright run.
 */
export function validateRunValues(parameters: ParameterDef[], values: Record<string, string>): string | null {
  const problems: string[] = [];
  for (const param of parameters) {
    const problem = validateParamValue(param, values[param.key]);
    if (problem) problems.push(problem);
  }
  return problems.length > 0 ? problems.join(" ") : null;
}

// Deliberately light: full RFC-compliant validation rejects real addresses;
// this catches the "obviously not an email" cases (no @, spaces, no domain).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailAddress(value: string): string | null {
  return EMAIL_RE.test(value.trim()) ? null : "Enter a valid email address.";
}
