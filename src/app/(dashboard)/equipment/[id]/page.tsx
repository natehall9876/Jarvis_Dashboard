import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { getEquipmentById } from "@/lib/data/equipment";

export const dynamic = "force-dynamic";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: equipment, error } = await getEquipmentById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!equipment) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={equipment.name}
        description={[equipment.manufacturer, equipment.model].filter(Boolean).join(" · ") || undefined}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={equipment.status} />
            {equipment.maintenance_warning ? <Badge tone="warning">Maintenance Soon</Badge> : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Current Hours</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatNumber(equipment.current_hours)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Maintenance Due Date</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(equipment.maintenance_due_date)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Maintenance Due Hours</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">
              {equipment.maintenance_due_hours !== null ? formatNumber(equipment.maintenance_due_hours) : "—"}
            </div>
          </CardBody>
        </Card>
      </div>

      {equipment.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{equipment.notes}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Maintenance History" description={`${equipment.maintenance_history.length} records`} />
        <CardBody>
          {equipment.maintenance_history.length === 0 ? (
            <EmptyState title="No maintenance recorded yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {equipment.maintenance_history.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="text-[var(--color-text-primary)]">{m.service_type}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {formatDate(m.service_date)} {m.vendor ? `· ${m.vendor}` : ""}
                    </div>
                  </div>
                  <span className="font-medium text-[var(--color-text-secondary)]">{formatCurrency(m.cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
