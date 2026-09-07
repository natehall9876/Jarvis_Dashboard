import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SearchForm } from "@/components/ui/search-form";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { getClients } from "@/lib/data/clients";
import type { ClientWithBalance } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { data: clients, error } = await getClients(q);

  const columns: Column<ClientWithBalance>[] = [
    {
      key: "name",
      header: "Client",
      render: (c) => (
        <div>
          <div className="font-medium text-[var(--color-text-primary)]">{c.name}</div>
          {c.company_name ? <div className="text-xs text-[var(--color-text-muted)]">{c.company_name}</div> : null}
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
    { key: "email", header: "Email", render: (c) => c.email ?? "—" },
    {
      key: "contact_method",
      header: "Preferred Contact",
      render: (c) => c.preferred_contact_method ?? "—",
    },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "properties", header: "Properties", align: "right", render: (c) => c.properties_count },
    {
      key: "balance",
      header: "Outstanding Balance",
      align: "right",
      render: (c) => (
        <span className={c.outstanding_balance > 0 ? "text-[var(--color-warning)]" : undefined}>
          {formatCurrency(c.outstanding_balance)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every client relationship — contact info, properties, and account balance."
        action={<SearchForm placeholder="Search clients..." defaultValue={q} />}
      />

      <Card>
        <DataStateGate
          error={error}
          isEmpty={!!clients && clients.length === 0}
          emptyTitle={q ? "No clients match your search" : "No clients yet"}
          emptyDescription={q ? undefined : "Clients synced from Supabase will appear here."}
        >
          {clients ? (
            <DataTable
              columns={columns}
              rows={clients}
              getRowKey={(c) => c.id}
              onRowHref={(c) => `/clients/${c.id}`}
            />
          ) : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
