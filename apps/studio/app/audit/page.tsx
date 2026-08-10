import { AuditLogView } from "../../components/audit-log-view";
import { NoConnection } from "../../components/no-connection";
import { getStore } from "../../lib/backend";
import { getUserContext } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const { tenantId } = await getUserContext();
  const connection = await (await getStore()).getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;
  return <AuditLogView />;
}
