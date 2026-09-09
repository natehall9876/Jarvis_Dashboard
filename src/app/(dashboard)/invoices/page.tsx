import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getInvoices } from "@/lib/data/invoices";
import { getClientOptions, getPropertyOptions } from "@/lib/data/options";
import { createInvoice } from "@/lib/actions/invoices";
import type { InvoiceWithClient } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const { new: isNew, error: formError } = await searchParams;
  const [{ data: invoices, error }, clients, properties] = await Promise.all([
    getInvoices(),
    isNew ? getClientOptions() : Promise.resolve({ data: [] }),
    isNew ? getPropertyOptions() : Promise.resolve({ data: [] }),
  ]);

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
          <div className="flex items-center gap-3">
            <Link href="/invoices/payments" className="text-sm text-[var(--color-accent)] hover:underline">
              View all payments →
            </Link>
            <Link href="/invoices?new=1">
              <Button>
                <Plus className="h-4 w-4" />
                Create Invoice
              </Button>
            </Link>
          </div>
        }
      />
      <Card>
        <DataStateGate error={error} isEmpty={!!invoices && invoices.length === 0} emptyTitle="No invoices yet">
          {invoices ? <DataTable columns={columns} rows={invoices} getRowKey={(i) => i.id} onRowHref={(i) => `/invoices/${i.id}`} /> : null}
        </DataStateGate>
      </Card>

      {isNew ? (
        <Modal title="Create Invoice" closeHref="/invoices">
          <InvoiceForm action={createInvoice} clients={clients.data ?? []} properties={properties.data ?? []} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
