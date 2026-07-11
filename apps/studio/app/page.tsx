/** Studio home (design 6b): object cards with inline status, recent publishes. */
import Link from "next/link";
import { getAdapter, getStore, TENANT_ID } from "../lib/backend";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = getStore();
  const adapter = getAdapter();
  const record = await store.getLayoutRecord(TENANT_ID, "deals");
  const describe = await adapter.describeObject("deals");
  const publishes = (await store.listPublishes(TENANT_ID)).slice(0, 6);
  const missingDescriptions = describe.fields.filter((f) => !f.description).length;
  const published = record.published;

  return (
    <div className="max-w-[860px]">
      <h1 className="text-[16px] font-semibold">Good afternoon</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        38 reps use these cards in chat. Everything here is scoped to one object at a time.
      </p>

      {record.draft && (
        <div className="mt-5 flex items-center justify-between rounded-[10px] border-l-[3px] border-warn-dot bg-draft px-4 py-3">
          <span className="text-[12.5px] text-draft-ink">
            You have an unpublished draft on <strong>Deals</strong> — reps still see v
            {published?.revision ?? "—"}.
          </span>
          <Link href="/objects/deals/layouts" className="st-btn">
            Resume draft
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Link href="/objects/deals/layouts" className="st-card block p-4 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">Deals</span>
            <span className="flex gap-1.5">
              {record.draft && (
                <span className="st-chip-mono bg-draft text-draft-ink">draft</span>
              )}
              {published && (
                <span className="st-chip-mono bg-published text-published-ink">
                  v{published.revision}
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-[12px] text-ink-55">
            <div>
              Layout “{published?.name ?? "—"}” · {published?.recordCard.sections.length ?? 0}{" "}
              section(s)
            </div>
            {missingDescriptions > 0 && (
              <div className="text-draft-ink">
                {missingDescriptions} of {describe.fields.length} fields lack descriptions →
                fix in HubSpot
              </div>
            )}
          </div>
        </Link>

        <div className="rounded-[13px] border border-dashed border-line p-4 text-[12.5px] text-ink-45">
          + Add an object
          <div className="mt-1 text-[11.5px]">
            Companies, Contacts and custom objects land with the object picker (3c).
          </div>
        </div>
      </div>

      <h2 className="st-section-label mt-8">Recent publishes</h2>
      <div className="st-card mt-2 divide-y divide-line-soft">
        {publishes.length === 0 && (
          <div className="px-4 py-3 text-[12.5px] text-ink-45">
            Nothing published yet — edits in the builder stay drafts until you publish.
          </div>
        )}
        {publishes.map((event) => (
          <div key={`${event.revision}-${event.timestamp}`} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[12.5px]">
              {event.kind === "rollback" ? "Rolled back" : "Published"} <strong>{event.object}</strong>{" "}
              layout
            </span>
            <span className="flex items-center gap-3">
              <span
                className={`st-chip-mono ${event.kind === "rollback" ? "bg-drift text-drift-ink" : "bg-published text-published-ink"}`}
              >
                v{event.revision}
              </span>
              <span className="text-[11.5px] text-ink-45">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
