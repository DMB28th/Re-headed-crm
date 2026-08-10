/** Assignment (2f–2i): v1 teaching state — one default layout, audiences later. */
import { getAdapter, getStore } from "../../../../lib/backend";
import { getUserContext } from "../../../../lib/auth";
import { NoConnection } from "../../../../components/no-connection";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  const { tenantId } = await getUserContext();
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;
  const record = await store.getLayoutRecord(tenantId, object);
  const layoutName = record.published?.name ?? "default layout";
  // Live user count when the CRM can answer; number-free copy otherwise.
  const userCount = await getAdapter(tenantId)
    .then((adapter) => adapter.getPortalInfo())
    .then((info) => info.userCount)
    .catch(() => null);

  return (
    <div className="max-w-[620px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.025em] capitalize">
        {object} audiences
      </h1>

      <div className="st-card mt-5 divide-y divide-line-soft">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-[12.5px]">
            <span className="st-chip-mono bg-paper text-ink-45">pinned</span>
            <strong>Default</strong> — everyone not matched above
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[12.5px]">{layoutName}</span>
            {record.published && (
              <span className="st-chip-mono bg-published text-published-ink">
                v{record.published.revision}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-line-soft bg-surface px-4 py-2.5 text-[11.5px] text-ink-55">
        Coverage:{" "}
        <strong>
          {userCount !== null ? `${userCount} users` : "everyone"} → {layoutName}
        </strong>{" "}
        · 0 overrides · 0 unassigned
      </div>

      <div className="mt-6 rounded-[13px] border border-dashed border-line p-6 text-center">
        <div className="text-[13px] font-medium">Everyone gets “{layoutName}”.</div>
        <p className="mx-auto mt-1 max-w-[400px] text-[13px] text-ink-55">
          Team-specific cards are not available yet. This page is intentionally read-only
          until CRM-native audience mapping is ready.
        </p>
      </div>
    </div>
  );
}
