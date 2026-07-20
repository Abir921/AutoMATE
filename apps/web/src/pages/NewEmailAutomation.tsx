import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function NewEmailAutomation() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [to, setTo] = useState("");
  const [toChangeable, setToChangeable] = useState(true);
  const [subject, setSubject] = useState("");
  const [subjectChangeable, setSubjectChangeable] = useState(false);
  const [body, setBody] = useState("");
  const [bodyChangeable, setBodyChangeable] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { id } = await api.createEmailAutomation({
        name: name || "Untitled email automation",
        fromEmail,
        appPassword,
        to,
        toChangeable,
        subject,
        subjectChangeable,
        body,
        bodyChangeable,
      });
      navigate(`/email-automations/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>New email automation</h2>

      <form onSubmit={submit}>
        <div className="card">
          <div className="field">
            <label>Automation name</label>
            <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Send weekly report" />
          </div>
        </div>

        <div className="card">
          <h3>Gmail sender</h3>
          <p className="muted">
            Sends via Gmail's SMTP server using an{" "}
            <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">
              App Password
            </a>{" "}
            - not your regular Gmail password. Requires 2-Step Verification to be turned on for your Google account.
          </p>
          <div className="field">
            <label>Your Gmail address</label>
            <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="you@gmail.com" required />
          </div>
          <div className="field">
            <label>App password</label>
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="16-character app password"
              required
            />
          </div>
        </div>

        <div className="card">
          <h3>Email content</h3>
          <div className="field">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label style={{ margin: 0 }}>To</label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={toChangeable} onChange={(e) => setToChangeable(e.target.checked)} />
                Changeable each run
              </label>
            </div>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" required />
          </div>
          <div className="field">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label style={{ margin: 0 }}>Subject</label>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={subjectChangeable}
                  onChange={(e) => setSubjectChangeable(e.target.checked)}
                />
                Changeable each run
              </label>
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" required />
          </div>
          <div className="field">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label style={{ margin: 0 }}>Body</label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={bodyChangeable} onChange={(e) => setBodyChangeable(e.target.checked)} />
                Changeable each run
              </label>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body"
              rows={6}
              required
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
        </div>

        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create email automation"}
        </button>
      </form>
    </div>
  );
}
