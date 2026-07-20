import { useState } from "react";
import type { Automation } from "@formautomator/shared";
import { api } from "../api";

/**
 * Connect/reconnect/disconnect a captured login session for a login-gated
 * site. The user logs in normally in their own browser and the extension
 * captures the resulting cookies - no password is ever stored or scripted.
 */
export default function LoginSessionCard({
  automation,
  onUpdate,
}: {
  automation: Automation;
  onUpdate: (patch: Partial<Automation>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  async function connect() {
    setError("");
    setBusy(true);
    try {
      const { connectToken, targetUrl } = await api.createSessionConnectToken(automation.id);
      let copied = false;
      try {
        await navigator.clipboard.writeText(connectToken);
        copied = true;
      } catch {
        // Clipboard write can fail (permissions/insecure context) - the code
        // is shown on screen below for manual copying, so this isn't fatal.
      }
      setConnectCode(connectToken);
      setCodeCopied(copied);
      window.open(targetUrl, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start connecting a session");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(connectCode);
      setCodeCopied(true);
    } catch {
      // Selecting the on-screen code and copying by hand still works.
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Disconnect the saved login session? You'll need to reconnect before running this automation again if the site requires you to be signed in."
      )
    )
      return;
    setError("");
    setBusy(true);
    try {
      await api.disconnectSession(automation.id);
      onUpdate({ hasLoginSession: false, sessionCapturedAt: null });
      setConnectCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Login session</h3>
          <p className="muted" style={{ margin: 0 }}>
            {automation.hasLoginSession ? (
              <>
                Connected
                {automation.sessionCapturedAt && (
                  <> &middot; captured {new Date(automation.sessionCapturedAt).toLocaleString()}</>
                )}
              </>
            ) : (
              "If this site requires you to be signed in, connect your login session - no password is ever stored."
            )}
          </p>
        </div>
        <div className="row">
          <button className="secondary" disabled={busy} onClick={connect}>
            {busy ? "Working..." : automation.hasLoginSession ? "Reconnect" : "Connect login session"}
          </button>
          {automation.hasLoginSession && (
            <button className="secondary" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          )}
        </div>
      </div>
      {connectCode && (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted">Connect code:</span>
            <code
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 13,
                wordBreak: "break-all",
                userSelect: "all",
              }}
            >
              {connectCode}
            </code>
            <button className="secondary" onClick={copyCode}>
              {codeCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <ol className="muted" style={{ marginTop: 10, paddingLeft: 18 }}>
            <li>Make sure you're logged in on the tab that just opened (log in if it asks you to - already signed in is fine too).</li>
            <li>Click the FormAutomator extension icon.</li>
            <li>
              Click "Capture session for this tab"
              {codeCopied
                ? " - the code above is already on your clipboard, so it should fill in by itself. If it doesn't, paste it manually."
                : " - paste the code above into the box first."}
            </li>
          </ol>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            The code expires after 15 minutes - click {automation.hasLoginSession ? "Reconnect" : "Connect"} again to get
            a fresh one.
          </p>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
