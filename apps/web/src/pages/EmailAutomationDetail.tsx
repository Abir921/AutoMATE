import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { EmailAutomation, EmailRunResult } from "@automate/shared";
import { api } from "../api";
import { validateEmailAddress } from "../validation";
import RenameHeading from "../components/RenameHeading";

export default function EmailAutomationDetail() {
  const { id } = useParams<{ id: string }>();
  const [automation, setAutomation] = useState<EmailAutomation | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<EmailRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [toError, setToError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.getEmailAutomation(id).then((a) => {
      setAutomation(a);
      setValues({ to: a.to, subject: a.subject, body: a.body });
    });
  }, [id]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !automation) return;
    setError("");

    if (automation.toChangeable) {
      const problem = validateEmailAddress(values.to ?? "");
      setToError(problem ?? "");
      if (problem) return;
    }

    setRunning(true);
    setResult(null);
    try {
      setResult(await api.runEmailAutomation(id, values));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
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
          await api.renameEmailAutomation(id!, name);
          setAutomation((a) => (a ? { ...a, name } : a));
        }}
      />
      <p className="muted">
        <span className="badge badge-email">Email</span>{" "}
        Sends from {automation.fromEmail}
      </p>

      <div className="card">
        {/* noValidate: the browser's native type=email tooltip would otherwise
            intercept the submit before our styled inline validation runs. */}
        <form onSubmit={run} noValidate>
          <div className="field">
            <label>To</label>
            <input
              type="email"
              value={values.to ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, to: e.target.value }));
                setToError("");
              }}
              disabled={!automation.toChangeable}
              style={toError ? { borderColor: "var(--danger)" } : undefined}
            />
            {toError && <div className="error">{toError}</div>}
          </div>
          <div className="field">
            <label>Subject</label>
            <input
              value={values.subject ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, subject: e.target.value }))}
              disabled={!automation.subjectChangeable}
            />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea
              value={values.body ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
              disabled={!automation.bodyChangeable}
              rows={6}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid var(--border)",
                borderRadius: 9,
                fontFamily: "inherit",
                fontSize: 14,
              }}
            />
          </div>
          <button type="submit" disabled={running}>
            {running ? "Sending..." : "Go"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>

      {result && (
        <div className="card">
          <h3>
            {result.success ? <span className="badge">Sent</span> : <span className="error">Failed</span>} &middot;{" "}
            {result.durationMs}ms
          </h3>
          {result.error && <div className="error">{result.error}</div>}
        </div>
      )}
    </div>
  );
}
