import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Automation, EmailAutomation } from "@automate/shared";
import { api } from "../api";

type ListItem =
  | { kind: "browser"; id: string; name: string; subtitle: string }
  | { kind: "email"; id: string; name: string; subtitle: string };

export default function MyApis() {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listAutomations(), api.listEmailAutomations()])
      .then(([automations, emailAutomations]) => {
        const browserItems: ListItem[] = automations.map((a: Automation) => ({
          kind: "browser",
          id: a.id,
          name: a.name,
          subtitle: a.startUrl,
        }));
        const emailItems: ListItem[] = emailAutomations.map((a: EmailAutomation) => ({
          kind: "email",
          id: a.id,
          name: a.name,
          subtitle: `From ${a.fromEmail} to ${a.to}`,
        }));
        setItems([...browserItems, ...emailItems]);
      })
      .catch((err) => setError(err.message));
  }, []);

  function startRename(item: ListItem) {
    setError("");
    setRenamingId(item.id);
    setRenameValue(item.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  async function saveRename(item: ListItem) {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === item.name) {
      cancelRename();
      return;
    }
    setError("");
    setSavingRename(true);
    try {
      if (item.kind === "browser") {
        await api.renameAutomation(item.id, trimmed);
      } else {
        await api.renameEmailAutomation(item.id, trimmed);
      }
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, name: trimmed } : i)) ?? null);
      cancelRename();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename automation");
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDelete(item: ListItem) {
    if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    setError("");
    setDeletingId(item.id);
    try {
      if (item.kind === "browser") {
        await api.deleteAutomation(item.id);
      } else {
        await api.deleteEmailAutomation(item.id);
      }
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete automation");
    } finally {
      setDeletingId(null);
    }
  }

  async function copySubtitle(item: ListItem) {
    try {
      await navigator.clipboard.writeText(item.subtitle);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 1500);
    } catch {
      // Clipboard unavailable - the full text is still visible via the title tooltip.
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>My APIs</h2>
        <Link to="/email-automations/new">
          <button className="secondary">+ New email automation</button>
        </Link>
      </div>

      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          To create a browser automation, install the AutoMATE browser extension, click the extension icon, hit{" "}
          <strong>Start Recording</strong>, do the task on any website, then hit <strong>Stop Recording</strong>.
          You'll be brought back here to review it.
        </p>
      </div>

      {error && <div className="error">{error}</div>}

      {items && items.length === 0 && (
        <div className="empty-state">
          <span className="empty-dot" />
          <h3>No automations yet</h3>
          <p>Record your first workflow with the extension, or create an email automation.</p>
          <Link to="/email-automations/new">
            <button className="secondary">+ New email automation</button>
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="api-list">
          {items.map((item) => (
            <div className="api-row" key={item.id}>
              <div className="api-row-main">
                {renamingId === item.id ? (
                  <div className="row" style={{ gap: 6 }}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(item);
                        if (e.key === "Escape") cancelRename();
                      }}
                      style={{ maxWidth: 260 }}
                    />
                    <button className="btn-sm" disabled={savingRename} onClick={() => saveRename(item)}>
                      {savingRename ? "Saving..." : "Save"}
                    </button>
                    <button className="secondary btn-sm" disabled={savingRename} onClick={cancelRename}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="api-row-name">{item.name}</span>
                    <span className={`badge ${item.kind === "email" ? "badge-email" : "badge-browser"}`}>
                      {item.kind === "email" ? "Email" : "Browser"}
                    </span>
                    <button className="btn-ghost" onClick={() => startRename(item)}>
                      Rename
                    </button>
                  </div>
                )}
                <div className="api-row-sub">
                  <span className="sub-text" title={item.subtitle}>
                    {item.subtitle}
                  </span>
                  <button className="btn-ghost" onClick={() => copySubtitle(item)}>
                    {copiedId === item.id ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="api-row-actions">
                <Link to={item.kind === "email" ? `/email-automations/${item.id}` : `/automations/${item.id}`}>
                  <button className="btn-sm">Open</button>
                </Link>
                <button
                  className="secondary btn-sm"
                  disabled={deletingId === item.id}
                  onClick={() => handleDelete(item)}
                >
                  {deletingId === item.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
