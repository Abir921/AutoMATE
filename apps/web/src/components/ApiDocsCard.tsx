import { useState } from "react";
import type { AutomationDocs } from "@formautomator/shared";
import { getToken } from "../api";

/** Collapsible REST API reference for one automation, including a ready-to-paste curl example. */
export default function ApiDocsCard({ docs }: { docs: AutomationDocs | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>REST API</h3>
        <button className="secondary" onClick={() => setOpen((s) => !s)}>
          {open ? "Hide" : "Show"} docs
        </button>
      </div>
      {open && docs && (
        <div style={{ marginTop: 12 }}>
          <p>
            <strong>{docs.method}</strong> <code>http://localhost:4000/api{docs.endpoint}</code>
          </p>
          <p className="muted">Send an Authorization: Bearer &lt;your token&gt; header.</p>
          <table>
            <thead>
              <tr>
                <th>Input</th>
                <th>Label</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {docs.inputs.map((i) => (
                <tr key={i.key}>
                  <td>
                    <code>{i.key}</code>
                  </td>
                  <td>{i.label}</td>
                  <td>{i.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 10 }}>
            {docs.output.description}
            {docs.output.fields.length > 0 && ` Fields: ${docs.output.fields.map((f) => f.key).join(", ")}.`}
          </p>
          <pre className="output">
            {`curl -X POST http://localhost:4000/api${docs.endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${getToken()}" \\
  -d '${JSON.stringify({ values: Object.fromEntries(docs.inputs.map((i) => [i.key, "..."])) })}'`}
          </pre>
        </div>
      )}
    </div>
  );
}
