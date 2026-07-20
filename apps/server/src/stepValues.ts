import { RecordedStep } from "@formautomator/shared";

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

/**
 * Returns a copy of the step with a new value applied - either as a query-string
 * parameter rewrite (URL-borne parameters on navigate steps) or as the step's
 * plain input value. Used both when baking review-screen edits into a new
 * automation (routes/automations.ts) and when substituting run-time parameter
 * values during replay (replayEngine.ts).
 */
export function withAppliedValue(step: RecordedStep, value: string, urlParam?: string): RecordedStep {
  if (urlParam && step.url) {
    try {
      const url = new URL(step.url);
      url.searchParams.set(urlParam, value);
      return { ...step, url: url.toString() };
    } catch {
      // Malformed URL - leave the step as recorded.
      return step;
    }
  }
  return { ...step, value };
}
