/** Audit log (compliance spine): every confirmed chat write, durably logged. */
import { getAuditLog, getStore } from "../../lib/backend";
import { getUserContext } from "../../lib/auth";
import { NoConnection } from "../../components/no-connection";

export const dynamic = "force-dynamic";

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/**
 * Confirmation provenance, stated only as strongly as the server can back it.
 * "Rep confirmed" means a confirm token minted by crm_preview_update verified
 * against this exact diff — not that a widget said so. Entries written before
 * 2026-08-02 carry nothing, and claiming either origin for them would be a
 * guess in a compliance record.
 */
function confirmationLabel(entry: { confirmation?: { via: "widget" | "model" } }): {
  text: string;
  title: string;
  className: string;
} {
  switch (entry.confirmation?.via) {
    case "widget":
      return {
        text: "Rep confirmed",
        title: "A rep confirmed this exact diff in the card; the server verified the confirmation token before writing.",
        className: "bg-paper text-ink",
      };
    case "model":
      return {
        text: "Model-initiated",
        title: "The assistant called the write tool directly — no confirmation diff was shown to a rep.",
        className: "bg-paper text-ink-55",
      };
    default:
      return {
        text: "Not recorded",
        title: "Logged before Cardstack recorded confirmation provenance (2026-08-02).",
        className: "bg-paper text-ink-45",
      };
  }
}

export default async function AuditPage() {
  const { tenantId } = await getUserContext();
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;

  const entries = await getAuditLog()
    .then((log) => log.list(tenantId))
    .catch(() => []);

  return (
    <div className="max-w-[980px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Write activity</h1>
        {entries.length > 0 && (
          <a href="/api/audit?format=csv" className="st-btn" download>
            Download CSV
          </a>
        )}
      </div>
      <p className="mt-1 max-w-[720px] text-[14px] text-ink-55">
        Every write from chat, with before/after values, who triggered it and who it was written
        as. Durable across restarts. The confirmation column is the server&rsquo;s own finding —
        &ldquo;Rep confirmed&rdquo; means it verified a token minted for that exact diff, not that
        the card claimed one.
      </p>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-[13px] border border-dashed border-line p-6 text-center">
          <div className="text-[13px] font-medium">No chat writes logged yet.</div>
          <p className="mx-auto mt-1 max-w-[420px] text-[12px] text-ink-55">
            When a rep confirms an edit from chat, it lands here — field, before, after, timestamp,
            and the connected user it was written as.
          </p>
        </div>
      ) : (
        <div className="st-card mt-5 overflow-hidden">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_0.9fr_1.8fr_0.9fr] gap-3 border-b border-line-soft px-4 py-2 md:grid">
            {["When", "Actor", "Written as", "Record", "Change", "Confirmation"].map((h) => (
              <span key={h} className="st-section-label">
                {h}
              </span>
            ))}
          </div>
          {entries.map((e) => (
            <div
              key={e.id}
              className="grid gap-2 border-b border-line-soft px-4 py-3 text-[13px] last:border-b-0 md:grid-cols-[1.2fr_1fr_1fr_0.9fr_1.8fr_0.9fr] md:gap-3"
            >
              <span className="text-ink-55">
                <span className="st-section-label mr-2 md:hidden">When</span>
                {new Date(e.timestamp).toLocaleString()}
              </span>
              <span><span className="st-section-label mr-2 md:hidden">Actor</span>{e.actor?.name ?? "—"}</span>
              <span><span className="st-section-label mr-2 md:hidden">Written as</span>{e.user}</span>
              <span className="text-ink-55">
                <span className="st-section-label mr-2 md:hidden">Record</span>
                <span className="st-chip-mono bg-paper text-ink-45">{e.object}</span> {e.recordId}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="st-section-label md:hidden">Change</span>
                {e.changes.map((c, i) => (
                  <span key={i}>
                    <strong>{c.field}</strong> {formatValue(c.before)} → {formatValue(c.after)}
                  </span>
                ))}
              </span>
              <span>
                <span className="st-section-label mr-2 md:hidden">Confirmation</span>
                {(() => {
                  const badge = confirmationLabel(e);
                  return (
                    <span
                      className={`st-chip-mono ${badge.className}`}
                      title={badge.title}
                    >
                      {badge.text}
                    </span>
                  );
                })()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
