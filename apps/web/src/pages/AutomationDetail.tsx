import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Automation, AutomationDocs, ParameterDef, RunResult } from "@automate/shared";
import { api } from "../api";
import { validateParamValue } from "../validation";
import { detectOccurrenceGroups, occurrenceOverrideKey, parseOccurrenceCount, OccurrenceGroup } from "../occurrenceFields";
import RenameHeading from "../components/RenameHeading";
import LoginSessionCard from "../components/LoginSessionCard";
import LicenseStatusCard from "../components/LicenseStatusCard";
import ParameterField from "../components/ParameterField";
import RunResultCard from "../components/RunResultCard";
import ApiDocsCard from "../components/ApiDocsCard";

export default function AutomationDetail() {
  const { id } = useParams<{ id: string }>();
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [docs, setDocs] = useState<AutomationDocs | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    api.getAutomation(id).then((a) => {
      setAutomation(a);
      setValues(Object.fromEntries(a.parameters.map((p) => [p.key, p.defaultValue])));
    });
    api.getDocs(id).then(setDocs);
  }, [id]);

  const occurrenceGroups = useMemo(
    () => (automation ? detectOccurrenceGroups(automation.parameters) : []),
    [automation]
  );
  const groupedKeys = useMemo(
    () => new Set(occurrenceGroups.flatMap((g) => g.recorded.map((p) => p.key))),
    [occurrenceGroups]
  );

  // Grows/shrinks the extra (unrecorded) occurrence slots live as the user
  // edits a controller field (e.g. "Children") - each new slot gets its own
  // real, independently-editable value instead of inheriting the last one.
  const controllerSignature = occurrenceGroups
    .map((g) => `${g.controllerKey}:${values[g.controllerKey] ?? ""}`)
    .join("|");
  useEffect(() => {
    if (occurrenceGroups.length === 0) return;
    setValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of occurrenceGroups) {
        const desired = parseOccurrenceCount(next[group.controllerKey], group.recorded.length);
        const prefix = `${group.urlParam}::occ::`;
        for (let i = group.recorded.length; i < desired; i++) {
          const key = occurrenceOverrideKey(group.urlParam, i);
          if (key in next) continue;
          const priorKey =
            i === group.recorded.length ? group.recorded[group.recorded.length - 1]?.key : occurrenceOverrideKey(group.urlParam, i - 1);
          next[key] = (priorKey ? next[priorKey] : undefined) ?? "";
          changed = true;
        }
        for (const key of Object.keys(next)) {
          if (!key.startsWith(prefix)) continue;
          const idx = Number(key.slice(prefix.length));
          if (idx >= desired) {
            delete next[key];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerSignature]);

  function updateValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !automation) return;
    setError("");

    // Catch junk input (letters in a number field, past dates, emptied-out
    // fields) here with per-field messages instead of letting the run fail
    // cryptically mid-replay. The server enforces the same rules as backstop.
    const problems: Record<string, string> = {};
    for (const p of automation.parameters) {
      const problem = validateParamValue(p, values[p.key]);
      if (problem) problems[p.key] = problem;
    }
    // Occurrence slots beyond what was recorded (e.g. a 3rd child's age) have
    // no ParameterDef of their own - validate them the same way, under the
    // synthesized key the run form tracks them by.
    for (const group of occurrenceGroups) {
      const desired = parseOccurrenceCount(values[group.controllerKey], group.recorded.length);
      for (let i = group.recorded.length; i < desired; i++) {
        const key = occurrenceOverrideKey(group.urlParam, i);
        const problem = validateParamValue({ label: `${group.labelRoot} ${i + 1}`, type: group.type }, values[key]);
        if (problem) problems[key] = problem;
      }
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setRunning(true);

    // Free text can't be format-checked (a place name has no fixed shape),
    // but a location field that's been changed from its recorded default can
    // be checked against the real site's own autocomplete - the same source
    // LocationField's dropdown already queries. Untouched defaults are
    // skipped (they came straight off the site at record time, so they're
    // already known-good) to avoid a network round trip on the common case
    // of running an automation unmodified.
    const locationProblems: Record<string, string> = {};
    for (const p of automation.parameters) {
      if (p.type !== "location") continue;
      const current = (values[p.key] ?? "").trim();
      if (!current || current === p.defaultValue.trim()) continue;
      try {
        const { suggestions } = await api.suggestLocations(id, p.key, current);
        const matched = suggestions.some((s) => s.trim().toLowerCase() === current.toLowerCase());
        if (!matched) {
          locationProblems[p.key] = `"${current}" doesn't match a real ${p.label.toLowerCase()} - pick a suggestion from the dropdown or check the spelling.`;
        }
      } catch {
        // Couldn't check (server hiccup, site unreachable) - don't block a
        // possibly-valid run over our own infra failing to confirm it.
      }
    }
    if (Object.keys(locationProblems).length > 0) {
      setFieldErrors(locationProblems);
      setRunning(false);
      return;
    }

    setResult(null);
    try {
      setResult(await api.runAutomation(id, values));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (!automation) return <p>Loading...</p>;

  return (
    <div>
      <RenameHeading
        name={automation.name}
        onRename={async (name) => {
          await api.renameAutomation(id!, name);
          setAutomation((a) => (a ? { ...a, name } : a));
        }}
      />
      <p className="muted">{automation.startUrl}</p>

      <LicenseStatusCard automation={automation} />

      <LoginSessionCard
        automation={automation}
        onUpdate={(patch) => setAutomation((a) => (a ? { ...a, ...patch } : a))}
      />

      <div className="card">
        <form onSubmit={run}>
          {automation.parameters.length === 0 && <p className="muted">This automation has no changeable inputs.</p>}
          {automation.parameters
            .filter((p) => !groupedKeys.has(p.key))
            .map((p) => (
              <ParameterField
                key={p.key}
                automationId={automation.id}
                param={p}
                value={values[p.key] ?? ""}
                error={fieldErrors[p.key]}
                onChange={(v) => updateValue(p.key, v)}
              />
            ))}
          {occurrenceGroups.map((group) => (
            <OccurrenceGroupFields
              key={group.urlParam}
              automationId={automation.id}
              group={group}
              values={values}
              fieldErrors={fieldErrors}
              onChange={updateValue}
            />
          ))}
          <button type="submit" disabled={running}>
            {running ? "Working..." : "Go"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>

      {result && <RunResultCard result={result} automation={automation} />}

      <ApiDocsCard docs={docs} />
    </div>
  );
}

/**
 * Renders one field per occurrence up to the controller's CURRENT value: the
 * recorded ones (age, age_2) as their real ParameterField, and any slot
 * beyond that as an independently-editable field of its own under a
 * synthesized key (occurrenceOverrideKey) - each new child gets its own
 * real input instead of a value borrowed from the last one.
 */
function OccurrenceGroupFields({
  automationId,
  group,
  values,
  fieldErrors,
  onChange,
}: {
  automationId: string;
  group: OccurrenceGroup;
  values: Record<string, string>;
  fieldErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const desired = parseOccurrenceCount(values[group.controllerKey], group.recorded.length);
  const fields = [];
  for (let i = 0; i < desired; i++) {
    if (i < group.recorded.length) {
      const p = group.recorded[i];
      fields.push(
        <ParameterField
          key={p.key}
          automationId={automationId}
          param={p}
          value={values[p.key] ?? ""}
          error={fieldErrors[p.key]}
          onChange={(v) => onChange(p.key, v)}
        />
      );
    } else {
      const key = occurrenceOverrideKey(group.urlParam, i);
      const syntheticParam: ParameterDef = {
        key,
        label: `${group.labelRoot} ${i + 1}`,
        selector: "",
        stepIndex: -1,
        defaultValue: "",
        type: group.type,
      };
      fields.push(
        <ParameterField
          key={key}
          automationId={automationId}
          param={syntheticParam}
          value={values[key] ?? ""}
          error={fieldErrors[key]}
          onChange={(v) => onChange(key, v)}
        />
      );
    }
  }
  return <>{fields}</>;
}
