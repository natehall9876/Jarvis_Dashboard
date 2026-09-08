import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/format";
import { getEquipment, type EquipmentWithMaintenanceFlag } from "@/lib/data/equipment";
import { TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
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
    { key: "manufacturer", header: "Manufacturer", render: (e) => e.manufacturer ?? "—" },
    { key: "model", header: "Model", render: (e) => e.model ?? "—" },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status ?? "active"} /> },
    { key: "hours", header: "Current Hours", align: "right", render: (e) => formatNumber(e.current_hours) },
    { key: "due_date", header: "Maintenance Due", render: (e) => formatDate(e.maintenance_due_date) },
    {
      key: "due_hours",
      header: "Due At (Hours)",
      align: "right",
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
      <PageHeader title="Equipment" description="Fleet status, hours, and upcoming maintenance." />
      <Card>
        <DataStateGate error={error} isEmpty={!!equipment && equipment.length === 0} emptyTitle="No equipment yet">
          {equipment ? <DataTable columns={columns} rows={equipment} getRowKey={(e) => e.id} onRowHref={(e) => `/equipment/${e.id}`} /> : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
