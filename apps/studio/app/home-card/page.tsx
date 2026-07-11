import { HomeCardBuilder } from "../../components/home-card-builder";
import { NoConnection } from "../../components/no-connection";
import { getStore, TENANT_ID } from "../../lib/backend";

export const dynamic = "force-dynamic";

export default async function HomeCardPage() {
  const connection = await (await getStore()).getConnection(TENANT_ID);
  if (connection.status !== "connected") return <NoConnection />;
  return <HomeCardBuilder />;
}
