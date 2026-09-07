import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SearchForm } from "@/components/ui/search-form";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { getProperties } from "@/lib/data/properties";
import type { PropertyWithClient } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { data: properties, error } = await getProperties(q);

  const columns: Column<PropertyWithClient>[] = [
    {
      key: "address",
      header: "Property",
      render: (p) => (
        <div>
          <div className="font-medium text-[var(--color-text-primary)]">{p.address_line1}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {p.city}, {p.state} {p.postal_code}
          </div>
        </div>
      ),
    },
    { key: "client", header: "Client", render: (p) => p.client?.company_name ?? p.client?.name ?? "—" },
    { key: "access", header: "Access Notes", render: (p) => p.access_notes ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={p.is_active ? "accent" : "neutral"}>{p.is_active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Every serviced address, with access notes and active services."
        action={<SearchForm placeholder="Search properties..." defaultValue={q} />}
      />

      <Card>
        <DataStateGate
          error={error}
          isEmpty={!!properties && properties.length === 0}
          emptyTitle={q ? "No properties match your search" : "No properties yet"}
        >
          {properties ? (
            <DataTable
              columns={columns}
              rows={properties}
              getRowKey={(p) => p.id}
              onRowHref={(p) => `/properties/${p.id}`}
            />
          ) : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
