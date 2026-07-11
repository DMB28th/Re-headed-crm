/** Assignment (2f–2i): v1 teaching state — one default layout, audiences later. */
import { getStore, TENANT_ID } from "../../../../lib/backend";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  const record = await (await getStore()).getLayoutRecord(TENANT_ID, object);
  const layoutName = record.published?.name ?? "default layout";

  return (
    <div className="max-w-[620px]">
      <h1 className="text-[16px] font-semibold capitalize">{object} · Assignment</h1>

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
        Coverage: <strong>38 → {layoutName}</strong> · 0 overrides · 0 unassigned
      </div>

      <div className="mt-6 rounded-[13px] border border-dashed border-line p-6 text-center">
        <div className="text-[13px] font-medium">Everyone gets “{layoutName}”.</div>
        <p className="mx-auto mt-1 max-w-[400px] text-[12px] text-ink-55">
          Add an audience to vary the card by team — audiences map to CRM-native groupings
          (HubSpot teams, Salesforce profiles), never hand-maintained lists. Lands with
          role-based layouts.
        </p>
        <button type="button" className="st-btn mt-3" disabled>
          + Add an audience
        </button>
      </div>
    </div>
  );
}
