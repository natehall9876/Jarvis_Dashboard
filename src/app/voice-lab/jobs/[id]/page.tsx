export default async function LabJob({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <h1 className="text-xl">Lab job page {id}</h1>;
}
