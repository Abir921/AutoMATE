import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="card" style={{ maxWidth: 400, margin: "60px auto" }}>
        <h2>Reset your password</h2>
        <div className="error">This reset link is missing its token - request a new one.</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 400, margin: "60px auto" }}>
        <h2>Password updated</h2>
        <p className="muted">Your password has been reset. Log in with your new password.</p>
        <button onClick={() => navigate("/login")}>Go to log in</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 400, margin: "60px auto" }}>
      <h2>Choose a new password</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Reset password"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
