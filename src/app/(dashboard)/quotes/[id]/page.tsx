import Link from "next/link";
import { Pencil, Plus, Send, Check, X as XIcon, ArrowRightLeft, Trash2, FileDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { ErrorState, NotConfiguredState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuoteItemForm } from "@/components/quotes/quote-item-form";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getQuoteById } from "@/lib/data/quotes";
import { getClientOptions, getPropertyOptions, getServiceOptions } from "@/lib/data/options";
import {
  updateQuote,
  deleteDraftQuote,
  addQuoteItem,
  removeQuoteItem,
  sendQuote,
  acceptQuote,
  declineQuote,
  convertQuoteToInvoice,
  convertQuoteToJob,
} from "@/lib/actions/quotes";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; addItem?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, addItem: isAddingItem, error: formError } = await searchParams;
  const [{ data: quote, error }, clients, properties, services] = await Promise.all([
    getQuoteById(id),
    isEditing ? getClientOptions() : Promise.resolve({ data: [] }),
    isEditing || isAddingItem ? getPropertyOptions() : Promise.resolve({ data: [] }),
    isAddingItem ? getServiceOptions() : Promise.resolve({ data: [] }),
  ]);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!quote) return null;

  const required = [...quote.items].filter((i) => !i.is_optional);
  const optional = [...quote.items].filter((i) => i.is_optional);

  const sendQuoteWithId = sendQuote.bind(null, id);
  const acceptQuoteWithId = acceptQuote.bind(null, id);
  const declineQuoteWithId = declineQuote.bind(null, id);
  const deleteDraftQuoteWithId = deleteDraftQuote.bind(null, id);
  const convertToInvoiceWithId = convertQuoteToInvoice.bind(null, id);
  const convertToJobWithId = convertQuoteToJob.bind(null, id);
  const updateQuoteWithId = updateQuote.bind(null, id);
  const addQuoteItemWithId = addQuoteItem.bind(null, id);
  const removeQuoteItemWithId = removeQuoteItem.bind(null, id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Quote ${quote.quote_number ?? ""}`}
        description={quote.client ? (
          <Link href={`/clients/${quote.client.id}`} className="hover:text-[var(--color-accent)]">
            {clientDisplayName(quote.client)}
          </Link>
        ) : undefined}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge status={quote.status} />
            {quote.status === "draft" ? (
              <form action={sendQuoteWithId}>
                <Button variant="secondary" type="submit">
                  <Send className="h-3.5 w-3.5" />
                  Mark Sent
                </Button>
              </form>
            ) : null}
            {quote.status === "sent" ? (
              <>
                <form action={acceptQuoteWithId}>
                  <Button type="submit">
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                </form>
                <form action={declineQuoteWithId}>
                  <ConfirmSubmit confirmMessage="Mark this quote as declined?" variant="secondary">
                    <XIcon className="h-3.5 w-3.5" />
                    Decline
                  </ConfirmSubmit>
                </form>
              </>
            ) : null}
            {quote.status === "accepted" ? (
              <>
                <form action={convertToJobWithId}>
                  <ConfirmSubmit confirmMessage="Create a scheduled job from this quote's required line items?" variant="secondary">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Create Job
                  </ConfirmSubmit>
                </form>
                <form action={convertToInvoiceWithId}>
                  <ConfirmSubmit confirmMessage="Create an invoice from this quote's required line items?" variant="secondary">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Create Invoice
                  </ConfirmSubmit>
                </form>
              </>
            ) : null}
            <Link href={`/quotes/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            <Button variant="secondary" disabled title="PDF export requires connecting a document-generation service">
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
            {quote.status === "draft" ? (
              <form action={deleteDraftQuoteWithId}>
                <ConfirmSubmit confirmMessage="Delete this draft quote? This can't be undone.">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Created</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(quote.created_at)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Valid Until</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(quote.valid_until)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Total</div>
            <div className="mt-1 text-sm font-semibold text-[var(--color-accent)]">{formatCurrency(quote.total)}</div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Line Items"
          action={
            <Link href={`/quotes/${id}?addItem=1`} className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </Link>
          }
        />
        <CardBody className="space-y-4">
          {quote.items.length === 0 ? (
            <EmptyState title="No line items yet" />
          ) : (
            <>
              <LineItemTable title="Included" items={required} removeAction={removeQuoteItemWithId} />
              {optional.length > 0 ? <LineItemTable title="Optional" items={optional} badge="Optional" removeAction={removeQuoteItemWithId} /> : null}
            </>
          )}
        </CardBody>
      </Card>

      {quote.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{quote.notes}</p>
          </CardBody>
        </Card>
      ) : null}

      {isEditing ? (
        <Modal title="Edit Quote" closeHref={`/quotes/${id}`}>
          <QuoteForm action={updateQuoteWithId} quote={quote} clients={clients.data ?? []} properties={properties.data ?? []} error={formError} />
        </Modal>
      ) : null}

      {isAddingItem ? (
        <Modal title="Add Line Item" closeHref={`/quotes/${id}`}>
          <QuoteItemForm action={addQuoteItemWithId} services={services.data ?? []} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}

function LineItemTable({
  title,
  items,
  badge,
  removeAction,
}: {
  title: string;
  items: { id: string; description: string; quantity: number; unit_price: number; total: number }[];
  badge?: string;
  removeAction: (itemId: string) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="group border-b border-[var(--color-border)] last:border-0">
              <td className="py-2 pr-4">
                {item.description} {badge ? <Badge tone="violet" className="ml-2">{badge}</Badge> : null}
              </td>
              <td className="py-2 pr-4 text-right text-[var(--color-text-muted)]">{item.quantity}×</td>
              <td className="py-2 pr-4 text-right text-[var(--color-text-secondary)]">{formatCurrency(item.unit_price, true)}</td>
              <td className="py-2 pr-2 text-right font-medium text-[var(--color-text-primary)]">
                {formatCurrency(item.total)}
              </td>
              <td className="w-8 py-2">
                <form action={removeAction.bind(null, item.id)}>
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
    </div>
  );
}
