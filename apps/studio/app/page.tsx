/** Studio home (design 6b): object cards with inline status, recent publishes. */
import Link from "next/link";
import { getAdapter, getStore } from "../lib/backend";
import { getStudioIdentity, getUserContext, userContextFor } from "../lib/auth";
import { AddObjectCard } from "../components/add-object-card";
import { NoConnection } from "../components/no-connection";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const identity = await getStudioIdentity();
  const { tenantId } = identity ? userContextFor(identity) : await getUserContext();
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  if (connection.status !== "connected") {
    // "Never connected" is onboarding, not an error, and it needs different
    // copy from "was connected, isn't now" — the second promises that layouts
    // come back, which is a lie to a brand-new workspace.
    const everConnected = !!(await store.tenantConfigCrm(tenantId).catch(() => undefined));
    const others = identity
      ? (await store.listMembershipsForAccount(identity.account.id).catch(() => [])).filter(
          (m) => m.workspaceId !== tenantId,
        ).length
      : 0;
    return (
      <NoConnection
        everConnected={everConnected}
        otherWorkspaces={others}
        {...(identity ? { workspaceName: identity.workspace.name } : {})}
      />
    );
  }
  const adapter = await getAdapter(tenantId);

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
    const records = await Promise.all(
      crmObjects.map(async (summary) => ({
        summary,
        record: await store.getLayoutRecord(tenantId, summary.api),
      })),
    );
    const described = await Promise.all(
      records.map(async ({ summary, record }) => {
        if (!record.draft && !record.published) return { summary, record };
        try {
          const describe = await adapter.describeObject(summary.api);
          return {
            summary,
            record,
            missingDescriptions: describe.fields.filter((field) => !field.description).length,
            fieldCount: describe.fields.length,
          };
        } catch (error) {
          crmError ??= String(error);
          return { summary, record, missingDescriptions: 0, fieldCount: 0 };
        }
      }),
    );
    for (const { summary, record, missingDescriptions = 0, fieldCount = 0 } of described) {
      if (record.draft || record.published) {
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
    for (const api of await store.listConfiguredObjects(tenantId)) {
      const record = await store.getLayoutRecord(tenantId, api);
      objects.push({ api, labelPlural: api, record, missingDescriptions: 0, fieldCount: 0 });
    }
  }
  const publishes = (await store.listPublishes(tenantId)).slice(0, 6);
  const drafted = objects.filter((o) => o.record.draft);

  return (
    <div className="max-w-[980px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Your CRM in chat</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-ink-55">
        {userCount !== null
          ? `${userCount} reps use these cards in chat.`
          : "Reps use these cards in chat."}{" "}
        Design what they see, control what they can change, and publish when it is ready.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {drafted[0] && (
          <Link
            href={`/objects/${drafted[0].api}/layouts`}
            className="st-btn st-btn--primary"
          >
            Review & publish {drafted[0].labelPlural}
          </Link>
        )}
        <Link href="/home-card" className="st-btn">
          Preview the rep home card
        </Link>
        <Link href="/flows" className="st-btn">
          Configure automations
        </Link>
        <Link href="/audit" className="st-btn">
          View write activity
        </Link>
      </div>

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

      <h2 className="mt-8 text-[16px] font-semibold">Cards</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {objects.map((object) => (
          <div key={object.api} className="st-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold capitalize">{object.labelPlural}</span>
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
            <div className="mt-2 space-y-1 text-[13px] text-ink-55">
              <div>
                Layout “{(object.record.published ?? object.record.draft)?.name ?? "—"}” ·{" "}
                {(object.record.published ?? object.record.draft)?.recordCard.sections.length ?? 0}{" "}
                section(s)
              </div>
              {object.missingDescriptions > 0 && (
                <Link
                  href={`/objects/${object.api}/layouts`}
                  className="block text-draft-ink underline-offset-2 hover:underline"
                >
                  {object.missingDescriptions} of {object.fieldCount} fields lack descriptions →
                  review in the builder
                </Link>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/objects/${object.api}/layouts`} className="st-btn st-btn--primary">
                Edit card
              </Link>
              <Link href={`/objects/${object.api}/lists`} className="st-btn">
                Lists & views
              </Link>
              <Link href={`/objects/${object.api}/permissions`} className="st-btn">
                Write access
              </Link>
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
