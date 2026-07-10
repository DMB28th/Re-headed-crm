/**
 * The signing moment and its aftermath: confirmation diff (1c), write receipt
 * (4c), partial failure (1e). Diff semantics never rely on color alone —
 * labels + strikethrough carry the meaning too.
 */
import type { FieldWriteResult, WriteReceiptPayload } from "@cardstack/core";

export function DiffTable({
  rows,
}: {
  rows: { label: string; before: string | null; after: string | null }[];
}) {
  return (
    <div className="wd-diff" role="table" aria-label="Changes to confirm">
      <div className="wd-diff-row wd-diff-head" role="row">
        <span role="columnheader">Field</span>
        <span role="columnheader">Before</span>
        <span role="columnheader">After</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="wd-diff-row" role="row">
          <span role="cell" className="wd-diff-field">
            {row.label}
          </span>
          <span role="cell" className="wd-diff-before">
            <s>{row.before ?? "—"}</s>
          </span>
          <span role="cell">
            <span className="wd-diff-after">{row.after ?? "—"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReceiptView({
  receipt,
  formatFieldValue,
  onOpenCurrent,
  opening,
}: {
  receipt: WriteReceiptPayload;
  formatFieldValue: (result: FieldWriteResult, value: FieldWriteResult["before"]) => string;
  onOpenCurrent: () => void;
  opening?: boolean | undefined;
}) {
  const time = new Date(receipt.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="wd-receipt">
      <div className="wd-receipt-head">
        <span className="wd-receipt-check" aria-hidden="true">
          ✓
        </span>
        <span className="wd-receipt-title">
          {receipt.savedCount} {receipt.savedCount === 1 ? "field" : "fields"} written to{" "}
          {receipt.provenance.crmLabel}
        </span>
        <span className="cs-muted wd-receipt-meta">
          {time} · {receipt.writtenAs}
        </span>
      </div>
      <div className="wd-receipt-lines">
        {receipt.results
          .filter((r) => r.ok)
          .map((r) => (
            <div key={r.field} className="wd-receipt-line">
              <span className="cs-muted">{r.label}</span>
              <span>
                <s className="cs-muted">{formatFieldValue(r, r.before)}</s>
                {" → "}
                {formatFieldValue(r, r.after)}
              </span>
            </div>
          ))}
      </div>
      <button type="button" className="cs-btn" onClick={onOpenCurrent} disabled={opening}>
        {opening ? "Opening…" : "Open current card"}
      </button>
    </div>
  );
}

export function PartialFailureView({
  receipt,
  formatFieldValue,
  onEditRetry,
}: {
  receipt: WriteReceiptPayload;
  formatFieldValue: (result: FieldWriteResult, value: FieldWriteResult["before"]) => string;
  onEditRetry: () => void;
}) {
  return (
    <div className="wd-receipt">
      <div className="wd-receipt-head">
        <span className="wd-receipt-warn" aria-hidden="true">
          !
        </span>
        <span className="wd-receipt-title">
          Saved {receipt.savedCount} of {receipt.results.length} changes
        </span>
      </div>
      <div className="wd-receipt-lines">
        {receipt.results.map((r) =>
          r.ok ? (
            <div key={r.field} className="wd-receipt-line">
              <span className="wd-field-ok">✓ {r.label}</span>
              <span>
                <s className="cs-muted">{formatFieldValue(r, r.before)}</s>
                {" → "}
                {formatFieldValue(r, r.after)}
              </span>
            </div>
          ) : (
            <div key={r.field} className="wd-receipt-line wd-receipt-line--failed">
              <span className="wd-field-fail">✕ {r.label}</span>
              {/* The CRM's verbatim validation message — never a generic error. */}
              <span className="wd-fail-message">{r.error}</span>
            </div>
          ),
        )}
      </div>
      <button type="button" className="cs-btn cs-btn--primary" onClick={onEditRetry}>
        Edit &amp; retry
      </button>
    </div>
  );
}
