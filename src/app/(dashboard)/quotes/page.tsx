import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { getQuotes, quoteTotal } from "@/lib/data/quotes";
import type { QuoteWithItems } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const { data: quotes, error } = await getQuotes();

  const columns: Column<QuoteWithItems>[] = [
    { key: "number", header: "Quote #", render: (q) => q.quote_number },
    { key: "client", header: "Client", render: (q) => q.client?.company_name ?? q.client?.name ?? "—" },
    { key: "issue_date", header: "Issue Date", render: (q) => formatDate(q.issue_date) },
    { key: "expiration", header: "Expires", render: (q) => formatDate(q.expiration_date) },
    { key: "items", header: "Line Items", align: "right", render: (q) => q.items.length },
    { key: "total", header: "Total", align: "right", render: (q) => formatCurrency(quoteTotal(q, true)) },
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
