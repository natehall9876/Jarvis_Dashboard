import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Archive, TriangleAlert } from "lucide-react";
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
import { getClientPhotos } from "@/lib/data/client-photos";
import { getServiceOptions } from "@/lib/data/options";
import { getJobPhotoUrls } from "@/lib/supabase/storage";
import { PhotoUploadForm } from "@/components/photos/photo-upload-form";
import { ServiceHistoryCard } from "@/components/jobs/service-history-card";
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

  const { client, properties, jobs, quotes, invoices, outstanding_balance, balance_verified } = data;
  const clientPhotos = await getClientPhotos(id);
  const { data: services } = await getServiceOptions();
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name]));
  const { urls: clientPhotoUrls, error: clientPhotoUrlsError } = await getJobPhotoUrls(clientPhotos.data.map((p) => p.storage_path));
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
            {balance_verified ? (
              <div className={`mt-1 text-sm font-semibold ${outstanding_balance > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]"}`}>
                {formatCurrency(outstanding_balance)}
              </div>
            ) : (
              <div className="mt-1 text-sm font-semibold text-[var(--color-text-muted)]" title="Synced from Homeworks — invoices aren't synced yet, so the real balance isn't known.">
                Not synced
              </div>
            )}
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

      <ServiceHistoryCard jobs={jobs} serviceNameById={serviceNameById} />

      <Card>
        <CardHeader title="Photos" description={`${clientPhotos.data.length} on file`} />
        <CardBody className="space-y-4">
          <PhotoUploadForm clientId={id} />
          {clientPhotos.error ? <p className="text-xs text-[var(--color-warning)]">{clientPhotos.error}</p> : null}
          {clientPhotos.data.length === 0 ? (
            <EmptyState title="No photos yet" description="Photos of this customer's properties and work appear here." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {clientPhotoUrlsError ? (
                <div className="col-span-2 sm:col-span-4">
                  <p className="flex items-start gap-1.5 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Photo previews are temporarily unavailable ({clientPhotoUrlsError}) — the {clientPhotos.data.length} file{clientPhotos.data.length === 1 ? "" : "s"} on record are unaffected.
                  </p>
                </div>
              ) : null}
              {clientPhotos.data.map((photo) => {
                const url = clientPhotoUrls.get(photo.storage_path);
                return (
                  <div key={photo.id} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={photo.caption ?? "Customer photo"} className="h-28 w-full object-cover" />
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center bg-[var(--color-surface-2)] text-[10px] text-[var(--color-text-muted)]">Unavailable</div>
                    )}
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{photo.caption ?? "Photo"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Client" closeHref={`/clients/${id}`}>
          <ClientForm action={updateClientWithId} client={client} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
