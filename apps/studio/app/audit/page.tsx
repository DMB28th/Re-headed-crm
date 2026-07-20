/** Audit log (compliance spine): every confirmed chat write, durably logged. */
import { getAuditLog, getStore } from "../../lib/backend";
import { getUserContext } from "../../lib/auth";
import { NoConnection } from "../../components/no-connection";

export const dynamic = "force-dynamic";

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
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
    <div className="max-w-[860px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold">Audit log</h1>
        {entries.length > 0 && (
          <a href="/api/audit?format=csv" className="st-btn" download>
            Download CSV
          </a>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Every write reps confirm from chat, with before/after values, who triggered it and who it
        was written as. Durable across restarts.
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
          <div className="grid grid-cols-[1.3fr_1.1fr_1.1fr_1fr_2fr] gap-3 border-b border-line-soft px-4 py-2">
            {["When", "Actor", "Written as", "Record", "Change"].map((h) => (
              <span key={h} className="st-section-label">
                {h}
              </span>
            ))}
          </div>
          {entries.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[1.3fr_1.1fr_1.1fr_1fr_2fr] gap-3 border-b border-line-soft px-4 py-2.5 text-[12px] last:border-b-0"
            >
              <span className="text-ink-55">{new Date(e.timestamp).toLocaleString()}</span>
              <span>{e.actor?.name ?? "—"}</span>
              <span>{e.user}</span>
              <span className="text-ink-55">
                <span className="st-chip-mono bg-paper text-ink-45">{e.object}</span> {e.recordId}
              </span>
              <span className="flex flex-col gap-0.5">
                {e.changes.map((c, i) => (
                  <span key={i}>
                    <strong>{c.field}</strong> {formatValue(c.before)} → {formatValue(c.after)}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
