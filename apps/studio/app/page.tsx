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

  // Real portal facts; null = unknown — the copy drops the number, never invents one.
  let userCount: number | null = null;
  try {
    userCount = (await adapter.getPortalInfo()).userCount;
  } catch {
    // copy degrades below
  }
  // Custom-object discovery blocked by a missing scope (HubSpot 403) — surfaced
  // by the adapter so "Every CRM object is configured." is never a lie.
  const customObjectsBlocked =
    (adapter as { customObjectsBlocked?: string | null }).customObjectsBlocked ?? null;

  // A CRM hiccup (missing scope, rate limit, timeout) degrades this page,
  // never blanks it — configured objects still render from the store.
  let crmError: string | null = null;
  const objects = [];
  const available = [];
  try {
    const crmObjects = await adapter.listObjects();
    for (const summary of crmObjects) {
      const record = await store.getLayoutRecord(TENANT_ID, summary.api);
      if (record.draft || record.published) {
        let missingDescriptions = 0;
        let fieldCount = 0;
        try {
          const describe = await adapter.describeObject(summary.api);
          missingDescriptions = describe.fields.filter((f) => !f.description).length;
          fieldCount = describe.fields.length;
        } catch (error) {
          crmError ??= String(error);
        }
        objects.push({
          api: summary.api,
          labelPlural: summary.labelPlural,
          record,
          missingDescriptions,
          fieldCount,
        });
      } else {
        available.push({ api: summary.api, labelPlural: summary.labelPlural });
      }
    }
  } catch (error) {
    crmError = String(error);
    for (const api of await store.listConfiguredObjects(TENANT_ID)) {
      const record = await store.getLayoutRecord(TENANT_ID, api);
      objects.push({ api, labelPlural: api, record, missingDescriptions: 0, fieldCount: 0 });
    }
  }
  const publishes = (await store.listPublishes(TENANT_ID)).slice(0, 6);
  const drafted = objects.filter((o) => o.record.draft);

  return (
    <div className="max-w-[860px]">
      <h1 className="text-[16px] font-semibold">{greeting()}</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        {userCount !== null
          ? `${userCount} reps use these cards in chat.`
          : "Reps use these cards in chat."}{" "}
        Everything here is scoped to one object at a time.
      </p>

      {crmError && (
        <div className="mt-5 rounded-[10px] border-l-[3px] border-drift-ink bg-drift px-4 py-3 text-[12.5px] text-drift-ink">
          Couldn't reach the CRM: {crmError} — if this mentions 403/scopes, fix the
          connection's app permissions and reconnect.
        </div>
      )}

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
          // Stretched-link card: the title link covers the card; the amber
          // metadata row is its own link (nested anchors are invalid HTML).
          <div key={object.api} className="st-card relative p-4 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <Link
                href={`/objects/${object.api}/layouts`}
                className="text-[13.5px] font-semibold capitalize after:absolute after:inset-0"
              >
                {object.labelPlural}
              </Link>
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
                <Link
                  href={`/objects/${object.api}/layouts`}
                  className="relative z-10 block text-draft-ink underline-offset-2 hover:underline"
                >
                  {object.missingDescriptions} of {object.fieldCount} fields lack descriptions →
                  review in the builder
                </Link>
              )}
            </div>
          </div>
        ))}

        <AddObjectCard available={available} customObjectsBlocked={customObjectsBlocked} />
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
