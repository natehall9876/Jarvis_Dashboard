import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SearchForm } from "@/components/ui/search-form";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { formatCurrency, clientPersonName } from "@/lib/format";
import { getClients } from "@/lib/data/clients";
import { createClient } from "@/lib/actions/clients";
import type { ClientWithBalance } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; error?: string }>;
}) {
  const { q, new: isNew, error: formError } = await searchParams;
  const { data: clients, error } = await getClients(q);

  const columns: Column<ClientWithBalance>[] = [
    {
      key: "name",
      header: "Client",
      render: (c) => {
        const personName = clientPersonName(c);
        return (
          <div>
            <div className="font-medium text-[var(--color-text-primary)]">{personName ?? c.company_name ?? "Unnamed client"}</div>
            {personName && c.company_name ? (
              <div className="text-xs text-[var(--color-text-muted)]">{c.company_name}</div>
            ) : null}
          </div>
        );
      },
    },
    { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
    { key: "email", header: "Email", render: (c) => c.email ?? "—" },
    {
      key: "contact_method",
      header: "Preferred Contact",
      render: (c) => c.preferred_contact_method ?? "—",
    },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status ?? "active"} /> },
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
        action={
          <div className="flex items-center gap-2">
            <SearchForm placeholder="Search clients..." defaultValue={q} />
            <Link href="/clients?new=1">
              <Button>
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <DataStateGate
          error={error}
          isEmpty={!!clients && clients.length === 0}
          emptyTitle={q ? "No clients match your search" : "No clients yet"}
          emptyDescription={q ? undefined : "Add your first client to get started."}
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

      {isNew ? (
        <Modal title="Add Client" closeHref="/clients">
          <ClientForm action={createClient} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
