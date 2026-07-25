import { RecordedStep } from "@automate/shared";

/**
 * "Sticky preference" query params: chosen once (usually on a site's home
 * page) and honored on any later URL, but NOT echoed into later URLs by the
 * site itself - the site normally remembers them in a cookie instead, which a
 * fresh replay browser doesn't have. Booking.com's currency picker is the
 * canonical case: picking INR loads index.html?selected_currency=INR once,
 * and every later page reads the cookie. Replay carries the last-seen value
 * of these params forward onto the final URL (replayEngine.ts), and
 * paramDetect.ts surfaces them as changeable parameters.
 */
export const PREFERENCE_URL_PARAMS = ["selected_currency"];

// MIRROR NOTE: apps/web/src/occurrenceFields.ts's occurrenceOverrideKey
// implements this exact same key convention - keep the two in sync. (Same
// CommonJS-can't-be-runtime-imported-by-the-browser constraint documented on
// the validation.ts mirror.)
//
// The run form only ever has real ParameterDef fields for occurrences that
// existed when the automation was recorded (age, age_2 for two children). If
// the user raises the count PAST what was recorded, there's no ParameterDef
// to hold that new slot's value - so the run form sends it under this
// synthesized key instead, and reconcileRepeatedOccurrences (replayEngine.ts)
// applies it directly to the matching URL occurrence.
export function occurrenceOverrideKey(urlParam: string, index: number): string {
  return `${urlParam}::occ::${index}`;
}

/**
 * Returns a copy of the step with a new value applied - either as a query-string
 * parameter rewrite (URL-borne parameters on navigate steps) or as the step's
 * plain input value. Used both when baking review-screen edits into a new
 * automation (routes/automations.ts) and when substituting run-time parameter
 * values during replay (replayEngine.ts).
 *
 * `urlParamOccurrence` targets one occurrence of a query key that repeats
 * (booking.com: one "age=" per child) instead of always overwriting the
 * first - URLSearchParams has no built-in "set the Nth occurrence", so this
 * reads every current value, replaces the one at that position, and rewrites
 * the whole key. Growing the occurrence COUNT (e.g. more children than were
 * ever recorded) is handled separately in replayEngine.ts, keyed off
 * ParameterDef.controlsOccurrenceCountOf - by the time a value reaches here,
 * the occurrence it targets normally already exists.
 */
export function withAppliedValue(
  step: RecordedStep,
  value: string,
  urlParam?: string,
  urlParamOccurrence?: number
): RecordedStep {
  if (urlParam && step.url) {
    try {
      const url = new URL(step.url);
      if (urlParamOccurrence === undefined) {
        url.searchParams.set(urlParam, value);
      } else {
        const values = url.searchParams.getAll(urlParam);
        if (urlParamOccurrence < values.length) {
          values[urlParamOccurrence] = value;
        } else {
          values.push(value); // out-of-range edit with no matching occurrence - append rather than drop it
        }
        url.searchParams.delete(urlParam);
        for (const v of values) url.searchParams.append(urlParam, v);
      }
      return { ...step, url: url.toString() };
    } catch {
      // Malformed URL - leave the step as recorded.
      return step;
    }
  }
  return { ...step, value };
}
