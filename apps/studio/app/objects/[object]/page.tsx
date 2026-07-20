/** Object landing (design 6a/12b): hub of four status cards, one per tab. */
import Link from "next/link";
import { scopeViewExposuresForUser } from "@cardstack/config-store";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContext } from "../../../lib/auth";
import { NoConnection } from "../../../components/no-connection";
import { RemoveObjectZone } from "../../../components/remove-object-zone";

export const dynamic = "force-dynamic";

export default async function ObjectHubPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  const user = await getUserContext();
  const { tenantId } = user;
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;

  const adapter = await getAdapter(tenantId);
  const record = await store.getLayoutRecord(tenantId, object);
  const layout = record.published ?? record.draft;
  const scopedExposures = await store
    .getViewExposuresConfig(tenantId, object)
    .then((config) => (config ? scopeViewExposuresForUser(config, user) : null));
  const exposures = scopedExposures?.views.filter((view) => view.exposed) ?? [];
  const customLists = scopedExposures?.customLists ?? [];
  const label = await adapter
    .listObjects()
    .then((objects) => objects.find((o) => o.api === object)?.labelPlural ?? object)
    .catch(() => object);

  const cards = [
    {
      href: `/objects/${object}/layouts`,
      title: "Layouts",
      status: record.published
        ? `Published v${record.published.revision}${record.draft ? " · draft in progress" : ""}`
        : record.draft
          ? "Draft — never published"
          : "Not configured yet",
      detail: layout
        ? `“${layout.name ?? "default"}” · ${layout.recordCard.sections.length} section(s) · ${layout.recordCard.sections.reduce((n, s) => n + s.fields.length, 0)} fields`
        : "Start from a generated draft in the builder.",
      warn: !!record.draft,
    },
    {
      href: `/objects/${object}/lists`,
      title: "Lists",
      status: `${exposures.length} exposed in chat`,
      detail:
        customLists.length > 0
          ? `${customLists.length} Cardstack list(s) defined here`
          : "Expose CRM views or define Cardstack lists.",
      warn: exposures.length === 0,
    },
    {
      href: `/objects/${object}/permissions`,
      title: "Permissions",
      status: layout
        ? layout.permissions.writeEnabled
          ? "Writes from chat: on"
          : "Writes from chat: off"
        : "Follows the layout",
      detail: layout
        ? `${layout.permissions.fieldDenylist.length} denylisted field(s) · confirmation always on`
        : "Configure after the first draft.",
      warn: false,
    },
    {
      href: `/objects/${object}/assignment`,
      title: "Assignment",
      status: "Everyone gets the default layout",
      detail: "Audiences (teams, profiles) land with role-based layouts.",
      warn: false,
    },
  ];

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[16px] font-semibold">{label}</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Everything about this object's cards, in one place — layouts, chat lists, write
        policy and who sees what.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="st-card block p-4 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">{card.title}</span>
              {card.warn && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-warn-dot"
                  title="Needs attention"
                />
              )}
            </div>
            <div className="mt-2 text-[12.5px]">{card.status}</div>
            <div className="mt-1 text-[11.5px] text-ink-55">{card.detail}</div>
          </Link>
        ))}
      </div>

      <RemoveObjectZone object={object} label={label} />
    </div>
  );
}
