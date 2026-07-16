import { HomeCardBuilder } from "../../components/home-card-builder";
import { NoConnection } from "../../components/no-connection";
import { getStore, requireTenantId } from "../../lib/backend";

export const dynamic = "force-dynamic";

export default async function HomeCardPage() {
  const TENANT_ID = await requireTenantId();
  const connection = await (await getStore()).getConnection(TENANT_ID);
  if (connection.status !== "connected") return <NoConnection />;
  return <HomeCardBuilder />;
}
