import { ViewsEditor } from "../../../../components/views-editor";
import { NoConnection } from "../../../../components/no-connection";
import { getStore, requireTenantId } from "../../../../lib/backend";

export const dynamic = "force-dynamic";

export default async function ListsPage({ params }: { params: Promise<{ object: string }> }) {
  const TENANT_ID = await requireTenantId();
  const { object } = await params;
  const connection = await (await getStore()).getConnection(TENANT_ID);
  if (connection.status !== "connected") return <NoConnection />;
  return <ViewsEditor object={object} />;
}
