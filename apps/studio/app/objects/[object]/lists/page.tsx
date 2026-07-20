import { ViewsEditor } from "../../../../components/views-editor";
import { NoConnection } from "../../../../components/no-connection";
import { getStore } from "../../../../lib/backend";
import { getUserContext } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function ListsPage({ params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  const { tenantId } = await getUserContext();
  const connection = await (await getStore()).getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;
  return <ViewsEditor object={object} />;
}
