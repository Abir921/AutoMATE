import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.forgotPassword(email);
      setSubmitted(true);
      setDevResetLink(result.devResetLink ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 400, margin: "60px auto" }}>
      <h2>Reset your password</h2>
      {submitted ? (
        <>
          <p className="muted">
            If an account exists for <strong>{email}</strong>, we've sent a link to reset the password. It expires in
            30 minutes.
          </p>
          {devResetLink && (
            <div className="card" style={{ marginTop: 12, background: "var(--bg)" }}>
              <p className="muted" style={{ margin: "0 0 8px" }}>
                <strong>Dev mode:</strong> this server has no email sending configured, so here's the reset link
                directly instead of emailing it. This would never happen in a real deployment.
              </p>
              <a href={devResetLink} style={{ wordBreak: "break-all" }}>
                {devResetLink}
              </a>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}
