import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SearchForm } from "@/components/ui/search-form";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PropertyForm } from "@/components/properties/property-form";
import { clientDisplayName } from "@/lib/format";
import { getProperties } from "@/lib/data/properties";
import { getClientOptions } from "@/lib/data/options";
import { createProperty } from "@/lib/actions/properties";
import type { PropertyWithClient } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; client?: string; error?: string }>;
}) {
  const { q, new: isNew, client: defaultClientId, error: formError } = await searchParams;
  const [{ data: properties, error }, clientsResult] = await Promise.all([
    getProperties(q),
    isNew ? getClientOptions() : Promise.resolve({ data: [], error: null }),
  ]);

  const columns: Column<PropertyWithClient>[] = [
    {
      key: "address",
      header: "Property",
      render: (p) => (
        <div>
          <div className="font-medium text-[var(--color-text-primary)]">{p.property_name || p.street || "Unnamed property"}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {[p.street, p.city, p.state, p.zip].filter(Boolean).join(", ")}
          </div>
        </div>
      ),
    },
    { key: "client", header: "Client", render: (p) => clientDisplayName(p.client) },
    { key: "access", header: "Access Notes", render: (p) => p.access_notes ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={p.active ? "accent" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Every serviced address, with access notes and active services."
        action={
          <div className="flex items-center gap-2">
            <SearchForm placeholder="Search properties..." defaultValue={q} />
            <Link href={`/properties?new=1${defaultClientId ? `&client=${defaultClientId}` : ""}`}>
              <Button>
                <Plus className="h-4 w-4" />
                Add Property
              </Button>
            </Link>
          </div>
        }
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

      {isNew ? (
        <Modal title="Add Property" closeHref="/properties">
          <PropertyForm action={createProperty} clients={clientsResult.data ?? []} defaultClientId={defaultClientId} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
