import { ViewsEditor } from "../../../../components/views-editor";

export default async function ListsPage({ params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  return <ViewsEditor object={object} />;
}
