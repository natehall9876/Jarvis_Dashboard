import Link from "next/link";
import { Pencil, Plus, Send, DollarSign, Ban, Trash2, X as XIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceItemForm } from "@/components/invoices/invoice-item-form";
import { RecordPaymentForm } from "@/components/invoices/record-payment-form";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getInvoiceById } from "@/lib/data/invoices";
import { getClientOptions, getPropertyOptions, getServiceOptions } from "@/lib/data/options";
import {
  updateInvoice,
  deleteDraftInvoice,
  voidInvoice,
  sendInvoice,
  addInvoiceItem,
  removeInvoiceItem,
  recordPayment,
} from "@/lib/actions/invoices";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; addItem?: string; pay?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, addItem: isAddingItem, pay: isPaying, error: formError } = await searchParams;
  const [{ data: invoice, error }, clients, properties, services] = await Promise.all([
    getInvoiceById(id),
    isEditing ? getClientOptions() : Promise.resolve({ data: [] }),
    isEditing ? getPropertyOptions() : Promise.resolve({ data: [] }),
    isAddingItem ? getServiceOptions() : Promise.resolve({ data: [] }),
  ]);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!invoice) return null;

  const updateInvoiceWithId = updateInvoice.bind(null, id);
  const deleteDraftInvoiceWithId = deleteDraftInvoice.bind(null, id);
  const voidInvoiceWithId = voidInvoice.bind(null, id);
  const sendInvoiceWithId = sendInvoice.bind(null, id);
  const addInvoiceItemWithId = addInvoiceItem.bind(null, id);
  const removeInvoiceItemWithId = removeInvoiceItem.bind(null, id);
  const recordPaymentWithId = recordPayment.bind(null, id, invoice.client_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice #${invoice.invoice_number ?? ""}`}
        description={invoice.client ? (
          <Link href={`/clients/${invoice.client.id}`} className="hover:text-[var(--color-accent)]">
            {clientDisplayName(invoice.client)}
          </Link>
        ) : undefined}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge status={invoice.display_status} />
            {invoice.status === "draft" ? (
              <form action={sendInvoiceWithId}>
                <Button type="submit">
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </form>
            ) : null}
            {invoice.balance > 0 && invoice.status !== "void" ? (
              <Link href={`/invoices/${id}?pay=1`}>
                <Button>
                  <DollarSign className="h-3.5 w-3.5" />
                  Record Payment
                </Button>
              </Link>
            ) : null}
            <Link href={`/invoices/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {invoice.status === "draft" ? (
              <form action={deleteDraftInvoiceWithId}>
                <ConfirmSubmit confirmMessage="Delete this draft invoice? This can't be undone.">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </ConfirmSubmit>
              </form>
            ) : invoice.status !== "void" ? (
              <form action={voidInvoiceWithId}>
                <ConfirmSubmit confirmMessage="Void this invoice? It stays in your records but no longer counts as owed. Accounting history is never deleted.">
                  <Ban className="h-3.5 w-3.5" />
                  Void
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total" value={formatCurrency(invoice.total)} />
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
        <CardHeader
          title="Line Items"
          action={
            <Link href={`/invoices/${id}?addItem=1`} className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </Link>
          }
        />
        <CardBody>
          {invoice.items.length === 0 ? (
            <EmptyState title="No line items" />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="group border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 pr-4">{item.description}</td>
                    <td className="py-2 pr-4 text-right text-[var(--color-text-muted)]">{item.quantity}×</td>
                    <td className="py-2 pr-4 text-right text-[var(--color-text-secondary)]">{formatCurrency(item.unit_price, true)}</td>
                    <td className="py-2 pr-2 text-right font-medium text-[var(--color-text-primary)]">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="w-8 py-2">
                      <form action={removeInvoiceItemWithId.bind(null, item.id)}>
                        <button
                          type="submit"
                          aria-label="Remove line item"
                          className="rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-critical-soft)] hover:text-[var(--color-critical)] group-hover:opacity-100"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </form>
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
                    {formatDate(p.payment_date)} — <span className="capitalize">{(p.payment_method ?? "unknown").replace("_", " ")}</span>
                    {p.external_reference ? ` (${p.external_reference})` : ""}
                  </span>
                  <span className="font-medium text-[var(--color-accent)]">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Invoice" closeHref={`/invoices/${id}`}>
          <InvoiceForm action={updateInvoiceWithId} invoice={invoice} clients={clients.data ?? []} properties={properties.data ?? []} error={formError} />
        </Modal>
      ) : null}

      {isAddingItem ? (
        <Modal title="Add Line Item" closeHref={`/invoices/${id}`}>
          <InvoiceItemForm action={addInvoiceItemWithId} services={services.data ?? []} error={formError} />
        </Modal>
      ) : null}

      {isPaying ? (
        <Modal title="Record Payment" closeHref={`/invoices/${id}`}>
          <RecordPaymentForm action={recordPaymentWithId} balance={invoice.balance} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
