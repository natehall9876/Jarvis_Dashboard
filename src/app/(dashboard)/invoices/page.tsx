import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getInvoices } from "@/lib/data/invoices";
import type { InvoiceWithClient } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const { data: invoices, error } = await getInvoices();

  const columns: Column<InvoiceWithClient>[] = [
    { key: "number", header: "Invoice #", render: (i) => i.invoice_number ?? "—" },
    { key: "client", header: "Client", render: (i) => clientDisplayName(i.client) },
    { key: "date", header: "Invoice Date", render: (i) => formatDate(i.invoice_date) },
    { key: "due", header: "Due Date", render: (i) => formatDate(i.due_date) },
    { key: "amount", header: "Amount", align: "right", render: (i) => formatCurrency(i.total) },
    { key: "paid", header: "Paid", align: "right", render: (i) => formatCurrency(i.amount_paid) },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (i) => (
        <span className={i.balance > 0 ? "font-medium text-[var(--color-warning)]" : "text-[var(--color-text-secondary)]"}>
          {formatCurrency(i.balance)}
        </span>
      ),
    },
    {
      key: "overdue",
      header: "Days Overdue",
      align: "right",
      render: (i) => (i.days_overdue > 0 ? <span className="text-[var(--color-critical)]">{i.days_overdue}</span> : "—"),
    },
    { key: "status", header: "Status", render: (i) => <StatusBadge status={i.display_status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Every invoice with payment status and days overdue."
        action={
          <Link href="/invoices/payments" className="text-sm text-[var(--color-accent)] hover:underline">
            View all payments →
          </Link>
        }
      />
      <Card>
        <DataStateGate error={error} isEmpty={!!invoices && invoices.length === 0} emptyTitle="No invoices yet">
          {invoices ? <DataTable columns={columns} rows={invoices} getRowKey={(i) => i.id} onRowHref={(i) => `/invoices/${i.id}`} /> : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
