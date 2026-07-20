import { useState } from "react";

export default function RenameHeading({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setError("");
    setValue(name);
    setEditing(true);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onRename(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename automation");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="row" style={{ gap: 8 }}>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            style={{ maxWidth: 360, fontSize: 20 }}
          />
          <button disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="secondary" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <h2 style={{ margin: 0 }}>{name}</h2>
      <button className="secondary" style={{ padding: "2px 8px" }} onClick={start}>
        Rename
      </button>
    </div>
  );
}
