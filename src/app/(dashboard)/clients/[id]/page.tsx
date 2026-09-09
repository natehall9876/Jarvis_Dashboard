import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDateOnly, clientDisplayName, propertyAddress } from "@/lib/format";
import { getClientById } from "@/lib/data/clients";
import { updateClient, archiveClient } from "@/lib/actions/clients";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, error: formError } = await searchParams;
  const { data, error } = await getClientById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!data) notFound();

  const { client, properties, jobs, quotes, invoices, outstanding_balance } = data;
  const updateClientWithId = updateClient.bind(null, id);
  const archiveClientWithId = archiveClient.bind(null, id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={clientDisplayName(client)}
        description={client.company_name && (client.first_name || client.last_name) ? client.company_name : undefined}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={client.status ?? "active"} />
            <Link href={`/clients/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {client.status !== "inactive" ? (
              <form action={archiveClientWithId}>
                <ConfirmSubmit confirmMessage={`Archive ${clientDisplayName(client)}? They'll be marked inactive but their history stays intact.`}>
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>
        }
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
        <CardHeader
          title="Properties"
          description={`${properties.length} on file`}
          action={
            <Link href={`/properties?new=1&client=${id}`} className="text-xs text-[var(--color-accent)] hover:underline">
              + Add property
            </Link>
          }
        />
        <CardBody>
          {properties.length === 0 ? (
            <EmptyState title="No properties yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {properties.map((p) => (
                <li key={p.id} className="py-2.5">
                  <Link href={`/properties/${p.id}`} className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]">
                    {propertyAddress(p)}
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
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>{formatDateOnly(j.scheduled_date)}</span>
                      <StatusBadge status={j.status} />
                    </Link>
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
                  <li key={qt.id}>
                    <Link
                      href={`/quotes/${qt.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>{qt.quote_number}</span>
                      <StatusBadge status={qt.status} />
                    </Link>
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
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>#{inv.invoice_number}</span>
                      <StatusBadge status={inv.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {isEditing ? (
        <Modal title="Edit Client" closeHref={`/clients/${id}`}>
          <ClientForm action={updateClientWithId} client={client} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
