import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "login" ? await api.login(email, password) : await api.signup(email, password, name);
      setToken(result.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 360, margin: "60px auto" }}>
      <h2>{mode === "login" ? "Log in" : "Create an account"}</h2>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <button type="submit" disabled={busy}>
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "login" ? "signup" : "login"); }}>
          {mode === "login" ? "Sign up" : "Log in"}
        </a>
      </p>
      {mode === "login" && (
        <p className="muted" style={{ marginTop: 6 }}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      )}
    </div>
  );
}
