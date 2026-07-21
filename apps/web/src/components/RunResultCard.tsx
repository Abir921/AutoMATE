import { useEffect, useState } from "react";
import type { Automation, ResultItem, RunResult } from "@automate/shared";

const RESULTS_PAGE_SIZE = 10;

/** The outcome of a run: scraped result cards, extracted output fields, or failure diagnostics. */
export default function RunResultCard({ result, automation }: { result: RunResult; automation: Automation }) {
  const [page, setPage] = useState(0);

  // A fresh run should always start back on the first page of its results.
  useEffect(() => setPage(0), [result]);

  const items = result.resultItems ?? [];
  const pageItems = items.slice(page * RESULTS_PAGE_SIZE, (page + 1) * RESULTS_PAGE_SIZE);
  const pageCount = Math.ceil(items.length / RESULTS_PAGE_SIZE);

  return (
    <div className="card">
      <h3>
        {result.success ? <span className="badge">Success</span> : <span className="error">Failed</span>} &middot;{" "}
        {result.durationMs}ms
      </h3>

      {result.success && items.length > 0 && (
        <>
          <div className="result-grid">
            {pageItems.map((item, i) => (
              <ResultCard key={i} item={item} />
            ))}
          </div>
          {pageCount > 1 && (
            <div className="row" style={{ marginTop: 14, justifyContent: "center" }}>
              {Array.from({ length: pageCount }).map((_, p) => (
                <button key={p} className={p === page ? undefined : "secondary"} onClick={() => setPage(p)}>
                  Page {p + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {result.success && automation.outputEnabled && (
        <table>
          <tbody>
            {automation.outputFields.map((f) => (
              <tr key={f.key}>
                <th>{f.label}</th>
                <td>{result.output?.[f.key] ?? "(not found)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result.success && !automation.outputEnabled && items.length === 0 && (
        <p className="muted">Task completed - no structured results were found on the result page.</p>
      )}

      {result.success && result.finalUrl && (
        <p className="muted" style={{ marginTop: 12 }}>
          <a href={result.finalUrl} target="_blank" rel="noopener noreferrer">
            Open the actual result page
          </a>
        </p>
      )}

      {result.error && (
        <div style={{ marginTop: 10 }}>
          <div className="error">{result.error}</div>
          {result.failedStep && (
            <p className="muted">
              Failed at step {result.failedStep.index + 1} ({result.failedStep.type}). Tried selectors:{" "}
              <code>{result.failedStep.selectors.join(", ")}</code>
            </p>
          )}
          {result.screenshot && (
            <div style={{ marginTop: 10 }}>
              <p className="muted">Screenshot at the point of failure:</p>
              <img
                src={`data:image/jpeg;base64,${result.screenshot}`}
                alt="Failure screenshot"
                style={{ maxWidth: "100%", border: "1px solid #d1d9e0", borderRadius: 6 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: ResultItem }) {
  const body = (
    <>
      <div className="result-card-media">
        {item.image ? <img src={item.image} alt="" /> : <span className="result-card-placeholder" />}
      </div>
      <div className="result-card-body">
        <div className="result-card-title">{item.title}</div>
        {item.price && <div className="result-card-price">{item.price}</div>}
        {item.details && item.details.length > 0 && (
          <ul className="result-card-details">
            {item.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return item.url ? (
    <a className="result-card" href={item.url} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="result-card">{body}</div>
  );
}
