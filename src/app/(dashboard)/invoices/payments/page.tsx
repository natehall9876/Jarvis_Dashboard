import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatCurrency, formatDateOnly, clientDisplayName } from "@/lib/format";
import { getPayments, type PaymentWithRelations } from "@/lib/data/payments";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const { data: payments, error } = await getPayments();

  const columns: Column<PaymentWithRelations>[] = [
    { key: "date", header: "Date", render: (p) => formatDateOnly(p.payment_date) },
    { key: "client", header: "Client", render: (p) => clientDisplayName(p.client) },
    {
      key: "invoice",
      header: "Invoice",
      render: (p) =>
        p.invoice ? (
          <Link href={`/invoices/${p.invoice.id}`} className="text-[var(--color-accent)] hover:underline">
            #{p.invoice.invoice_number ?? p.invoice.id.slice(0, 8)}
          </Link>
        ) : (
          <span className="text-[var(--color-text-muted)]">Unlinked</span>
        ),
    },
    { key: "method", header: "Method", render: (p) => <span className="capitalize">{(p.payment_method ?? "—").replace("_", " ")}</span> },
    { key: "reference", header: "External Reference", render: (p) => p.external_reference ?? "—" },
    { key: "amount", header: "Amount", align: "right", render: (p) => formatCurrency(p.amount) },
  ];

  const total = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={payments ? `${payments.length} recorded — ${formatCurrency(total)} total` : "Every payment received, across all clients and invoices."}
        action={
          <Link href="/invoices" className="text-sm text-[var(--color-accent)] hover:underline">
            ← Back to Invoices
          </Link>
        }
      />
      <Card>
        <DataStateGate error={error} isEmpty={!!payments && payments.length === 0} emptyTitle="No payments recorded yet">
          {payments ? <DataTable columns={columns} rows={payments} getRowKey={(p) => p.id} /> : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
