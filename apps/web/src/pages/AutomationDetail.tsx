import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Automation, AutomationDocs, RunResult } from "@automate/shared";
import { api } from "../api";
import { validateParamValue } from "../validation";
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
          {automation.parameters.map((p) => (
            <ParameterField
              key={p.key}
              automationId={automation.id}
              param={p}
              value={values[p.key] ?? ""}
              error={fieldErrors[p.key]}
              onChange={(v) => {
                setValues((prev) => ({ ...prev, [p.key]: v }));
                // Editing a field clears its error - it re-validates on Go.
                setFieldErrors((prev) => {
                  if (!(p.key in prev)) return prev;
                  const next = { ...prev };
                  delete next[p.key];
                  return next;
                });
              }}
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
