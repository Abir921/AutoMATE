import type { ParameterDef } from "@formautomator/shared";
import { CURRENCY_OPTIONS } from "../currencies";
import { displayLabel, humanizeTokenListValue } from "../paramDisplay";
import LocationField from "./LocationField";

/** One run-form input, rendered with the right control for the parameter's type. */
export default function ParameterField({
  automationId,
  param,
  value,
  onChange,
  error,
}: {
  automationId: string;
  param: ParameterDef;
  value: string;
  onChange: (value: string) => void;
  /** Validation message for this field - red border + inline text when set. */
  error?: string;
}) {
  const errorBorder = error ? { borderColor: "var(--danger)" } : undefined;
  const errorText = error ? <div className="error">{error}</div> : null;
  const label = displayLabel(param);

  if (param.type === "checkbox") {
    return (
      <div className="field">
        <label className="row" style={{ gap: 8, textTransform: "none", letterSpacing: 0 }}>
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
          {label}
        </label>
        {errorText}
      </div>
    );
  }

  if (param.type === "currency") {
    return (
      <div className="field">
        <label>{label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={errorBorder}>
          {/* Keep an unlisted recorded value selectable rather than silently swapping it. */}
          {value && !CURRENCY_OPTIONS.some((c) => c.code === value) && <option value={value}>{value}</option>}
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} - {c.name}
            </option>
          ))}
        </select>
        {errorText}
      </div>
    );
  }

  if (param.type === "location") {
    return (
      <div className="field">
        <label>{label}</label>
        <LocationField automationId={automationId} param={param} value={value} onChange={onChange} />
        {errorText}
      </div>
    );
  }

  // Some recorded fields are a raw aggregate filter string (e.g. booking.com's
  // "nflt=entire_place_bedroom_count=2;stay_type=1;..."), with no individual
  // control to break it into separate fields - the input stays a plain,
  // editable text box (so it still works for hand-editing), but a read-only
  // summary underneath translates it into plain words.
  const tokenSummary = humanizeTokenListValue(value);

  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={param.type === "number" ? "number" : param.type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={errorBorder}
      />
      {tokenSummary && (
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Currently: {tokenSummary}
        </p>
      )}
      {errorText}
    </div>
  );
}
