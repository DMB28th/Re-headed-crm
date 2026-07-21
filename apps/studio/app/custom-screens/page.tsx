import { CustomScreensEditor } from "../../components/custom-screens-editor";
import { NoConnection } from "../../components/no-connection";
import { getStore } from "../../lib/backend";
import { getUserContext } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function CustomScreensPage() {
  const { tenantId } = await getUserContext();
  const connection = await (await getStore()).getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;
  return <CustomScreensEditor />;
}
