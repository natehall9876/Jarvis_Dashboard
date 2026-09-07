import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/format";
import { getClientById } from "@/lib/data/clients";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getClientById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!data) notFound();

  const { client, properties, jobs, quotes, invoices, outstanding_balance } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.name}
        description={client.company_name ?? undefined}
        action={<StatusBadge status={client.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Phone</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{client.phone ?? "—"}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Email</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{client.email ?? "—"}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Outstanding Balance</div>
            <div className={`mt-1 text-sm font-semibold ${outstanding_balance > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]"}`}>
              {formatCurrency(outstanding_balance)}
            </div>
          </CardBody>
        </Card>
      </div>

      {client.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{client.notes}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Properties" description={`${properties.length} on file`} />
        <CardBody>
          {properties.length === 0 ? (
            <EmptyState title="No properties yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {properties.map((p) => (
                <li key={p.id} className="py-2.5">
                  <Link href={`/properties/${p.id}`} className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]">
                    {p.address_line1}, {p.city}, {p.state}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recent Jobs" />
          <CardBody>
            {jobs.length === 0 ? (
              <EmptyState title="No jobs yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {jobs.slice(0, 8).map((j) => (
                  <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/jobs/${j.id}`} className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                      {formatDate(j.scheduled_date)}
                    </Link>
                    <StatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quotes" />
          <CardBody>
            {quotes.length === 0 ? (
              <EmptyState title="No quotes yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {quotes.slice(0, 8).map((qt) => (
                  <li key={qt.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/quotes/${qt.id}`} className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                      {qt.quote_number}
                    </Link>
                    <StatusBadge status={qt.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Invoices" />
          <CardBody>
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {invoices.slice(0, 8).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/invoices/${inv.id}`} className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                      #{inv.invoice_number}
                    </Link>
                    <StatusBadge status={inv.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
