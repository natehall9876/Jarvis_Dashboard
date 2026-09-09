import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EquipmentForm } from "@/components/equipment/equipment-form";
import { formatDateOnly, formatNumber } from "@/lib/format";
import { getEquipment, type EquipmentWithMaintenanceFlag } from "@/lib/data/equipment";
import { createEquipment } from "@/lib/actions/equipment";
import { TriangleAlert, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const { new: isNew, error: formError } = await searchParams;
  const { data: equipment, error } = await getEquipment();

  const columns: Column<EquipmentWithMaintenanceFlag>[] = [
    {
      key: "name",
      header: "Equipment",
      render: (e) => (
        <div className="flex items-center gap-2">
          {e.maintenance_warning ? <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" /> : null}
          <span className="font-medium text-[var(--color-text-primary)]">{e.name}</span>
        </div>
      ),
    },
    { key: "manufacturer", header: "Manufacturer", hideOnMobile: true, render: (e) => e.manufacturer ?? "—" },
    { key: "model", header: "Model", hideOnMobile: true, render: (e) => e.model ?? "—" },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status ?? "active"} /> },
    { key: "hours", header: "Current Hours", align: "right", hideOnMobile: true, render: (e) => formatNumber(e.current_hours) },
    { key: "due_date", header: "Maintenance Due", render: (e) => formatDateOnly(e.maintenance_due_date) },
    {
      key: "due_hours",
      header: "Due At (Hours)",
      align: "right",
      hideOnMobile: true,
      render: (e) => (e.maintenance_due_hours !== null ? formatNumber(e.maintenance_due_hours) : "—"),
    },
    {
      key: "warning",
      header: "Flag",
      render: (e) => (e.maintenance_warning ? <Badge tone="warning">Maintenance Soon</Badge> : null),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment"
        description="Fleet status, hours, and upcoming maintenance."
        action={
          <Link href="/equipment?new=1">
            <Button>
              <Plus className="h-4 w-4" />
              Add Equipment
            </Button>
          </Link>
        }
      />
      <Card>
        <DataStateGate error={error} isEmpty={!!equipment && equipment.length === 0} emptyTitle="No equipment yet">
          {equipment ? <DataTable columns={columns} rows={equipment} getRowKey={(e) => e.id} onRowHref={(e) => `/equipment/${e.id}`} /> : null}
        </DataStateGate>
      </Card>

      {isNew ? (
        <Modal title="Add Equipment" closeHref="/equipment">
          <EquipmentForm action={createEquipment} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
