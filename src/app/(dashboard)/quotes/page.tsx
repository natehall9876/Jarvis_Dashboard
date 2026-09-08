import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getQuotes } from "@/lib/data/quotes";
import type { QuoteWithItems } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const { data: quotes, error } = await getQuotes();

  const columns: Column<QuoteWithItems>[] = [
    { key: "number", header: "Quote #", render: (q) => q.quote_number ?? "—" },
    { key: "client", header: "Client", render: (q) => clientDisplayName(q.client) },
    { key: "created", header: "Created", align: "left", render: (q) => formatDate(q.created_at) },
    { key: "expiration", header: "Valid Until", render: (q) => formatDate(q.valid_until) },
    { key: "items", header: "Line Items", align: "right", render: (q) => q.items.length },
    { key: "total", header: "Total", align: "right", render: (q) => formatCurrency(q.total) },
    { key: "status", header: "Status", render: (q) => <StatusBadge status={q.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Quotes" description="Draft, sent, accepted, and declined quotes with line-item detail." />
      <Card>
        <DataStateGate error={error} isEmpty={!!quotes && quotes.length === 0} emptyTitle="No quotes yet">
          {quotes ? <DataTable columns={columns} rows={quotes} getRowKey={(q) => q.id} onRowHref={(q) => `/quotes/${q.id}`} /> : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
