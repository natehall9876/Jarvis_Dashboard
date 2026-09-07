import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatDate } from "@/lib/format";
import { getInvoiceById } from "@/lib/data/invoices";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: invoice, error } = await getInvoiceById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!invoice) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice #${invoice.invoice_number}`}
        description={invoice.client ? (
          <Link href={`/clients/${invoice.client.id}`} className="hover:text-[var(--color-accent)]">
            {invoice.client.company_name ?? invoice.client.name}
          </Link>
        ) : undefined}
        action={<StatusBadge status={invoice.status} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total" value={formatCurrency(invoice.total_amount)} />
        <StatTile label="Paid" value={formatCurrency(invoice.amount_paid)} tone="accent" />
        <StatTile label="Balance" value={formatCurrency(invoice.balance)} tone={invoice.balance > 0 ? "warning" : "neutral"} />
        <StatTile
          label="Days Overdue"
          value={invoice.days_overdue > 0 ? invoice.days_overdue : "—"}
          tone={invoice.days_overdue > 0 ? "critical" : "neutral"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Invoice Date</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(invoice.invoice_date)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Due Date</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(invoice.due_date)}</div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Line Items" />
        <CardBody>
          {invoice.items.length === 0 ? (
            <EmptyState title="No line items" />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 pr-4">{item.description}</td>
                    <td className="py-2 pr-4 text-right text-[var(--color-text-muted)]">{item.quantity}×</td>
                    <td className="py-2 pr-4 text-right text-[var(--color-text-secondary)]">{formatCurrency(item.unit_price, true)}</td>
                    <td className="py-2 text-right font-medium text-[var(--color-text-primary)]">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payments" description={`${invoice.payments.length} recorded`} />
        <CardBody>
          {invoice.payments.length === 0 ? (
            <EmptyState title="No payments recorded" />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[var(--color-text-secondary)]">
                    {formatDate(p.payment_date)} — <span className="capitalize">{p.method.replace("_", " ")}</span>
                    {p.external_reference ? ` (${p.external_reference})` : ""}
                  </span>
                  <span className="font-medium text-[var(--color-accent)]">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
