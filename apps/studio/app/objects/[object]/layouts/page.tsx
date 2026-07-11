import { Builder } from "../../../../components/builder/builder";

export default async function LayoutsPage({ params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  return <Builder object={object} />;
}
