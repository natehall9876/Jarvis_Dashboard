export default async function LabClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <h1 className="text-xl">Lab client page {id}</h1>;
}
