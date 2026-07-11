/** Studio home (design 6b): object cards with inline status, recent publishes. */
import Link from "next/link";
import { getAdapter, getStore, TENANT_ID } from "../lib/backend";
import { AddObjectCard } from "../components/add-object-card";
import { NoConnection } from "../components/no-connection";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const store = await getStore();
  const adapter = await getAdapter();
  const connection = await store.getConnection(TENANT_ID);
  if (connection.status !== "connected") {
    return <NoConnection />;
  }

  const crmObjects = await adapter.listObjects();
  const objects = [];
  const available = [];
  for (const summary of crmObjects) {
    const record = await store.getLayoutRecord(TENANT_ID, summary.api);
    if (record.draft || record.published) {
      const describe = await adapter.describeObject(summary.api);
      objects.push({
        api: summary.api,
        labelPlural: summary.labelPlural,
        record,
        missingDescriptions: describe.fields.filter((f) => !f.description).length,
        fieldCount: describe.fields.length,
      });
    } else {
      available.push({ api: summary.api, labelPlural: summary.labelPlural });
    }
  }
  const publishes = (await store.listPublishes(TENANT_ID)).slice(0, 6);
  const drafted = objects.filter((o) => o.record.draft);

  return (
    <div className="max-w-[860px]">
      <h1 className="text-[16px] font-semibold">{greeting()}</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        38 reps use these cards in chat. Everything here is scoped to one object at a time.
      </p>

      {drafted.map((object) => (
        <div
          key={object.api}
          className="mt-5 flex items-center justify-between rounded-[10px] border-l-[3px] border-warn-dot bg-draft px-4 py-3"
        >
          <span className="text-[12.5px] text-draft-ink">
            You have an unpublished draft on{" "}
            <strong className="capitalize">{object.labelPlural}</strong> — reps still see{" "}
            {object.record.published ? `v${object.record.published.revision}` : "nothing (never published)"}.
          </span>
          <Link href={`/objects/${object.api}/layouts`} className="st-btn">
            Resume draft
          </Link>
        </div>
      ))}

      <div className="mt-6 grid grid-cols-2 gap-4">
        {objects.map((object) => (
          <Link
            key={object.api}
            href={`/objects/${object.api}/layouts`}
            className="st-card block p-4 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold capitalize">{object.labelPlural}</span>
              <span className="flex gap-1.5">
                {object.record.draft && (
                  <span className="st-chip-mono bg-draft text-draft-ink">draft</span>
                )}
                {object.record.published && (
                  <span className="st-chip-mono bg-published text-published-ink">
                    v{object.record.published.revision}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-[12px] text-ink-55">
              <div>
                Layout “{(object.record.published ?? object.record.draft)?.name ?? "—"}” ·{" "}
                {(object.record.published ?? object.record.draft)?.recordCard.sections.length ?? 0}{" "}
                section(s)
              </div>
              {object.missingDescriptions > 0 && (
                <div className="text-draft-ink">
                  {object.missingDescriptions} of {object.fieldCount} fields lack descriptions →
                  fix in HubSpot
                </div>
              )}
            </div>
          </Link>
        ))}

        <AddObjectCard available={available} />
      </div>

      <h2 className="st-section-label mt-8">Recent publishes</h2>
      <div className="st-card mt-2 divide-y divide-line-soft">
        {publishes.length === 0 && (
          <div className="px-4 py-3 text-[12.5px] text-ink-45">
            Nothing published yet — edits in the builder stay drafts until you publish.
          </div>
        )}
        {publishes.map((event) => (
          <Link
            key={`${event.object}-${event.revision}-${event.timestamp}`}
            href={event.object === "home card" ? "/home-card" : `/objects/${event.object}/layouts`}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-paper"
          >
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
          </Link>
        ))}
      </div>
    </div>
  );
}
