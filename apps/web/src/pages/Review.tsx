import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { OutputField, ParamType, ParameterCandidate, ParameterDef } from "@automate/shared";
import { CURRENCY_OPTIONS } from "../currencies";
import { validateParamValue } from "../validation";
import { api } from "../api";

interface EditableParam {
  candidate: ParameterCandidate;
  include: boolean;
  key: string;
  label: string;
  type: ParamType;
  value: string; // editable - user can keep the recorded value or change it here
}

interface EditableOutputField {
  key: string;
  label: string;
  selectors: string[];
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "value"
  );
}

/** Maps the recorded HTML input type onto the run-form control we'll render for it. */
function toParamType(inputType: string | undefined): ParamType {
  switch (inputType) {
    case "date":
      return "date";
    case "number":
      return "number";
    case "checkbox":
    case "radio":
      return "checkbox";
    case "location":
      return "location";
    case "currency":
      return "currency";
    default:
      return "text";
  }
}

export default function Review() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();

  const [startUrl, setStartUrl] = useState("");
  const [stepCount, setStepCount] = useState(0);
  const [params, setParams] = useState<EditableParam[]>([]);
  const [name, setName] = useState("");
  const [outputEnabled, setOutputEnabled] = useState(false);
  const [outputFields, setOutputFields] = useState<EditableOutputField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paramErrors, setParamErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!draftId) return;
    api
      .getDraft(draftId)
      .then((draft) => {
        setStartUrl(draft.startUrl);
        setStepCount(draft.steps.length);
        setParams(
          draft.candidates.map((c) => ({
            candidate: c,
            include: true,
            key: slugify(c.suggestedLabel),
            label: c.suggestedLabel,
            type: toParamType(c.inputType),
            value: c.sampleValue,
          }))
        );
        if (draft.outputFields.length > 0) {
          setOutputEnabled(true);
          setOutputFields(draft.outputFields.map((f) => ({ key: f.key, label: f.label, selectors: f.selectors })));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [draftId]);

  function updateParam(index: number, patch: Partial<EditableParam>) {
    setParams((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    // Editing a row clears its error - it re-validates on Create.
    setParamErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  function updateOutputField(index: number, patch: Partial<EditableOutputField>) {
    setOutputFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeOutputField(index: number) {
    setOutputFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draftId) return;
    setError("");

    // Don't bake in a default that would then fail on every run: validate
    // changeable values, plus fixed values the user edited on this screen.
    // Untouched fixed values are left alone - they replay exactly as recorded.
    const problems: Record<number, string> = {};
    params.forEach((p, i) => {
      const wasEdited = p.value !== p.candidate.sampleValue;
      if (!p.include && !wasEdited) return;
      const problem = validateParamValue(p, p.value);
      if (problem) problems[i] = problem;
    });
    setParamErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setBusy(true);
    try {
      const parameters: ParameterDef[] = params
        .filter((p) => p.include)
        .map((p) => ({
          key: p.key,
          label: p.label,
          selector: p.candidate.selector,
          stepIndex: p.candidate.stepIndex,
          defaultValue: p.value,
          type: p.type,
          urlParam: p.candidate.urlParam,
        }));

      const fields: OutputField[] = outputFields
        .filter((f) => f.label.trim() && f.selectors[0]?.trim())
        .map((f) => ({ key: slugify(f.label), label: f.label.trim(), selectors: f.selectors.filter(Boolean) }));

      // Fixed (non-changeable) fields whose value the user edited on this screen:
      // bake the new value into the recorded step itself.
      const stepOverrides = params
        .filter((p) => !p.include && p.value !== p.candidate.sampleValue)
        .map((p) => ({ stepIndex: p.candidate.stepIndex, value: p.value, urlParam: p.candidate.urlParam }));

      const { id } = await api.createAutomation({
        draftId,
        name: name || "Untitled automation",
        parameters,
        outputEnabled,
        outputFields: outputEnabled ? fields : undefined,
        stepOverrides,
      });
      navigate(`/automations/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (loading) return <p>Loading recorded session...</p>;
  if (error && params.length === 0) return <div className="error">{error}</div>;

  return (
    <div>
      <h2>Review your recording</h2>
      <p className="muted">
        Started at <code>{startUrl}</code> &middot; {stepCount} step(s) captured
      </p>

      <form onSubmit={submit}>
        <div className="card">
          <div className="field">
            <label>Automation name</label>
            <input
              className="name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hotel availability check"
            />
          </div>
        </div>

        {params.length > 0 && (
          <div className="card">
            <h3>Summary</h3>
            <p className="muted">Here's everything you entered while recording.</p>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value you entered</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p, i) => (
                  <tr key={i}>
                    <td>{p.label}</td>
                    <td>
                      {p.type === "checkbox"
                        ? p.candidate.sampleValue === "true"
                          ? "Checked"
                          : "Not checked"
                        : p.candidate.sampleValue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card">
          <h3>Changeable details</h3>
          <p className="muted">
            We identified these fields automatically. Leave a field checked to make it changeable each time you run
            this automation - uncheck anything that should always stay the same.
          </p>
          {params.length === 0 && <p className="muted">No changeable values detected in this recording.</p>}
          {params.map((p, i) => (
            <ChangeableDetailRow key={i} param={p} error={paramErrors[i]} onUpdate={(patch) => updateParam(i, patch)} />
          ))}
        </div>

        <div className="card">
          <h3>Output</h3>
          <label>
            <input type="checkbox" checked={outputEnabled} onChange={(e) => setOutputEnabled(e.target.checked)} /> I
            want the results back (uncheck for actions with no output, like sending an email)
          </label>

          {outputEnabled && (
            <div style={{ marginTop: 14 }}>
              {outputFields.length === 0 ? (
                <p className="muted">
                  The run will confirm the task completed. Structured output extraction is configured automatically
                  when the recording captures result content.
                </p>
              ) : (
                <>
                  <p className="muted">These are the pieces of info that will be extracted. Rename or remove any you don't need.</p>
                  {outputFields.map((f, i) => (
                    <div key={i} className="row" style={{ marginTop: 8 }}>
                      <input
                        value={f.label}
                        onChange={(e) => updateOutputField(i, { label: e.target.value })}
                        placeholder="Label (e.g. Price)"
                      />
                      <button type="button" className="secondary" onClick={() => removeOutputField(i)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          Create automation
        </button>
      </form>
    </div>
  );
}

/**
 * One detected field: whether it's changeable at run time, its current/baked-in
 * value, and (when changeable) its user-facing label and input type.
 */
function ChangeableDetailRow({
  param,
  error,
  onUpdate,
}: {
  param: EditableParam;
  error?: string;
  onUpdate: (patch: Partial<EditableParam>) => void;
}) {
  return (
    <div className="field" style={{ borderTop: "1px solid #eaeef2", paddingTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{param.label}</strong>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={param.include} onChange={(e) => onUpdate({ include: e.target.checked })} />
          Changeable each run
        </label>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {param.type === "checkbox" ? (
          <label className="row" style={{ gap: 6, flex: 2 }}>
            <input
              type="checkbox"
              checked={param.value === "true"}
              onChange={(e) => onUpdate({ value: e.target.checked ? "true" : "false" })}
            />
            {param.value === "true" ? "Checked" : "Not checked"}
          </label>
        ) : param.type === "currency" ? (
          <select value={param.value} onChange={(e) => onUpdate({ value: e.target.value })} style={{ flex: 2 }}>
            {param.value && !CURRENCY_OPTIONS.some((c) => c.code === param.value) && (
              <option value={param.value}>{param.value}</option>
            )}
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={param.type === "number" ? "number" : param.type === "date" ? "date" : "text"}
            value={param.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            style={{ flex: 2 }}
          />
        )}
        {param.include && (
          <>
            <input
              value={param.label}
              onChange={(e) => onUpdate({ label: e.target.value, key: slugify(e.target.value) })}
              placeholder="Field label"
              style={{ flex: 1 }}
            />
            <select value={param.type} onChange={(e) => onUpdate({ type: e.target.value as ParamType })}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="checkbox">Checkbox</option>
              <option value="location">Location search</option>
              <option value="currency">Currency</option>
            </select>
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <p className="muted" style={{ margin: "6px 0 0" }}>
        {param.include
          ? "You'll be able to change this value every time you run the automation."
          : "This value stays fixed - edit it above if you want a different one baked in."}
      </p>
    </div>
  );
}
