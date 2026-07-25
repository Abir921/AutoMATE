import type { ParameterDef, ParamType } from "@automate/shared";

// MIRROR NOTE: apps/server/src/stepValues.ts's occurrenceOverrideKey
// implements this exact same key convention - keep the two in sync. (Same
// CommonJS-can't-be-runtime-imported-by-the-browser constraint documented on
// validation.ts.)
//
// The run form only has a real ParameterDef field for occurrences that
// existed when the automation was recorded (age, age_2 for two children).
// Raising the count past that has no ParameterDef to hold the new slot's
// value, so it's tracked under this synthesized key in the same values
// record instead - the server applies it directly to that URL occurrence.
export function occurrenceOverrideKey(urlParam: string, index: number): string {
  return `${urlParam}::occ::${index}`;
}

export interface OccurrenceGroup {
  urlParam: string;
  controllerKey: string;
  type: ParamType;
  labelRoot: string;
  /** The real ParameterDef fields that existed at record time, in occurrence order. */
  recorded: ParameterDef[];
}

/**
 * Groups a "repeated key per unit" of an automation's params (one age field
 * per recorded child) with the OTHER param that recorded the matching count
 * (children) - only when paramDetect.ts linked them at recording time via
 * ParameterDef.controlsOccurrenceCountOf. A repeated param with no detected
 * controller renders exactly as recorded, with no dynamic growth - there's no
 * signal for what "one more" should mean.
 */
export function detectOccurrenceGroups(parameters: ParameterDef[]): OccurrenceGroup[] {
  const byUrlParam = new Map<string, ParameterDef[]>();
  for (const p of parameters) {
    if (p.urlParamOccurrence === undefined || !p.urlParam) continue;
    const arr = byUrlParam.get(p.urlParam) ?? [];
    arr.push(p);
    byUrlParam.set(p.urlParam, arr);
  }

  const groups: OccurrenceGroup[] = [];
  for (const [urlParam, recorded] of byUrlParam) {
    const controller = parameters.find((p) => p.controlsOccurrenceCountOf === urlParam);
    if (!controller) continue;
    recorded.sort((a, b) => (a.urlParamOccurrence ?? 0) - (b.urlParamOccurrence ?? 0));
    groups.push({
      urlParam,
      controllerKey: controller.key,
      type: recorded[0].type,
      labelRoot: recorded[0].label.replace(/\s+\d+$/, ""),
      recorded,
    });
  }
  return groups;
}

/** Parses a controller field's current text value into a slot count, falling back when it's not a usable number yet. */
export function parseOccurrenceCount(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
