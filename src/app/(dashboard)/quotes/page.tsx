import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { QuoteForm } from "@/components/quotes/quote-form";
import { formatCurrency, formatDate, formatDateOnly, clientDisplayName } from "@/lib/format";
import { getQuotes } from "@/lib/data/quotes";
import { getClientOptions, getPropertyOptions } from "@/lib/data/options";
import { createQuote } from "@/lib/actions/quotes";
import type { QuoteWithItems } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const { new: isNew, error: formError } = await searchParams;
  const [{ data: quotes, error }, clients, properties] = await Promise.all([
    getQuotes(),
    isNew ? getClientOptions() : Promise.resolve({ data: [] }),
    isNew ? getPropertyOptions() : Promise.resolve({ data: [] }),
  ]);

  const columns: Column<QuoteWithItems>[] = [
    { key: "number", header: "Quote #", render: (q) => q.quote_number ?? "—" },
    { key: "client", header: "Client", render: (q) => clientDisplayName(q.client) },
    { key: "created", header: "Created", align: "left", render: (q) => formatDate(q.created_at) },
    { key: "expiration", header: "Valid Until", render: (q) => formatDateOnly(q.valid_until) },
    { key: "items", header: "Line Items", align: "right", render: (q) => q.items.length },
    { key: "total", header: "Total", align: "right", render: (q) => formatCurrency(q.total) },
    { key: "status", header: "Status", render: (q) => <StatusBadge status={q.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        description="Draft, sent, accepted, and declined quotes with line-item detail."
        action={
          <Link href="/quotes?new=1">
            <Button>
              <Plus className="h-4 w-4" />
              Create Quote
            </Button>
          </Link>
        }
      />
      <Card>
        <DataStateGate error={error} isEmpty={!!quotes && quotes.length === 0} emptyTitle="No quotes yet">
          {quotes ? <DataTable columns={columns} rows={quotes} getRowKey={(q) => q.id} onRowHref={(q) => `/quotes/${q.id}`} /> : null}
        </DataStateGate>
      </Card>

      {isNew ? (
        <Modal title="Create Quote" closeHref="/quotes">
          <QuoteForm action={createQuote} clients={clients.data ?? []} properties={properties.data ?? []} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
