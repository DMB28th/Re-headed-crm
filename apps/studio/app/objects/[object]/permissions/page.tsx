import { PermissionsEditor } from "../../../../components/permissions-editor";

export default async function PermissionsPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  return <PermissionsEditor object={object} />;
}
