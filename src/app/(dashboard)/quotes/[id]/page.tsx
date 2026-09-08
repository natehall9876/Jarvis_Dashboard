import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { ErrorState, NotConfiguredState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getQuoteById } from "@/lib/data/quotes";
import { FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: quote, error } = await getQuoteById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!quote) return null;

  const required = [...quote.items].filter((i) => !i.is_optional);
  const optional = [...quote.items].filter((i) => i.is_optional);

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
          <div className="flex items-center gap-2">
            <StatusBadge status={quote.status} />
            <Button variant="secondary" disabled title="PDF export requires connecting a document-generation service">
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
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
        <CardHeader title="Line Items" />
        <CardBody className="space-y-4">
          <LineItemTable title="Included" items={required} />
          {optional.length > 0 ? <LineItemTable title="Optional" items={optional} badge="Optional" /> : null}
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
    </div>
  );
}

function LineItemTable({
  title,
  items,
  badge,
}: {
  title: string;
  items: { id: string; description: string; quantity: number; unit_price: number; total: number; budgeted_hours: number | null }[];
  badge?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
              <td className="py-2 pr-4">
                {item.description} {badge ? <Badge tone="violet" className="ml-2">{badge}</Badge> : null}
              </td>
              <td className="py-2 pr-4 text-right text-[var(--color-text-muted)]">{item.quantity}×</td>
              <td className="py-2 pr-4 text-right text-[var(--color-text-secondary)]">{formatCurrency(item.unit_price, true)}</td>
              <td className="py-2 text-right font-medium text-[var(--color-text-primary)]">
                {formatCurrency(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
