import Link from "next/link";
import { Pencil, Wrench, PowerOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { EquipmentForm } from "@/components/equipment/equipment-form";
import { MaintenanceForm } from "@/components/equipment/maintenance-form";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDateOnly, formatNumber } from "@/lib/format";
import { getEquipmentById } from "@/lib/data/equipment";
import { updateEquipment, retireEquipment, logMaintenance } from "@/lib/actions/equipment";

export const dynamic = "force-dynamic";

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; log?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, log: isLogging, error: formError } = await searchParams;
  const { data: equipment, error } = await getEquipmentById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!equipment) return null;

  const updateEquipmentWithId = updateEquipment.bind(null, id);
  const retireEquipmentWithId = retireEquipment.bind(null, id);
  const logMaintenanceWithId = logMaintenance.bind(null, id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={equipment.name}
        description={[equipment.manufacturer, equipment.model].filter(Boolean).join(" · ") || undefined}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={equipment.status ?? "active"} />
            {equipment.maintenance_warning ? <Badge tone="warning">Maintenance Soon</Badge> : null}
            <Link href={`/equipment/${id}?log=1`}>
              <Button variant="secondary">
                <Wrench className="h-3.5 w-3.5" />
                Log Maintenance
              </Button>
            </Link>
            <Link href={`/equipment/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {equipment.status !== "out_of_service" ? (
              <form action={retireEquipmentWithId}>
                <ConfirmSubmit confirmMessage={`Mark ${equipment.name} as out of service?`}>
                  <PowerOff className="h-3.5 w-3.5" />
                  Retire
                </ConfirmSubmit>
              </form>
            ) : null}
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
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDateOnly(equipment.maintenance_due_date)}</div>
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
                    <div className="text-[var(--color-text-primary)]">{m.maintenance_type ?? "Service"}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {formatDateOnly(m.maintenance_date)} {m.vendor ? `· ${m.vendor}` : ""}
                    </div>
                  </div>
                  <span className="font-medium text-[var(--color-text-secondary)]">{formatCurrency(m.parts_cost + m.labor_cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Equipment" closeHref={`/equipment/${id}`}>
          <EquipmentForm action={updateEquipmentWithId} equipment={equipment} error={formError} />
        </Modal>
      ) : null}

      {isLogging ? (
        <Modal title="Log Maintenance" closeHref={`/equipment/${id}`}>
          <MaintenanceForm action={logMaintenanceWithId} currentHours={equipment.current_hours} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
