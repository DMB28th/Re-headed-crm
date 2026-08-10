import { CustomScreenEditor } from "../../../components/custom-screen-editor";
import { NoConnection } from "../../../components/no-connection";
import { getStore } from "../../../lib/backend";
import { getUserContext } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function CustomScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  const { tenantId } = await getUserContext();
  const connection = await (await getStore()).getConnection(tenantId);
  if (connection.status !== "connected") return <NoConnection />;
  return <CustomScreenEditor screenId={screen} />;
}
