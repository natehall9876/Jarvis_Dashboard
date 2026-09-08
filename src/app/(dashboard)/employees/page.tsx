import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatHours } from "@/lib/format";
import { getEmployees } from "@/lib/data/employees";
import type { EmployeeWithStats } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const { data: employees, error } = await getEmployees();

  const columns: Column<EmployeeWithStats>[] = [
    {
      key: "name",
      header: "Employee",
      render: (e) => (
        <div className="font-medium text-[var(--color-text-primary)]">
          {e.first_name} {e.last_name}
        </div>
      ),
    },
    { key: "role", header: "Role", render: (e) => <span className="capitalize">{(e.role ?? "crew_member").replace("_", " ")}</span> },
    { key: "rate", header: "Hourly Rate", align: "right", render: (e) => formatCurrency(e.hourly_rate ?? 0, true) },
    { key: "status", header: "Active", render: (e) => <Badge tone={e.active ? "accent" : "neutral"}>{e.active ? "Active" : "Inactive"}</Badge> },
    { key: "license", header: "Driver's License", render: (e) => (e.has_drivers_license ? "Yes" : "No") },
    { key: "hours", header: "Hours This Week", align: "right", render: (e) => formatHours(e.hours_this_week) },
    { key: "labor", header: "Labor Cost", align: "right", render: (e) => formatCurrency(e.labor_cost_this_week) },
    { key: "jobs", header: "Jobs This Week", align: "right", render: (e) => e.jobs_worked_this_week },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Employees" description="Crew roster, hourly rates, and this week's production contribution." />
      <Card>
        <DataStateGate error={error} isEmpty={!!employees && employees.length === 0} emptyTitle="No employees yet">
          {employees ? <DataTable columns={columns} rows={employees} getRowKey={(e) => e.id} onRowHref={(e) => `/employees/${e.id}`} /> : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
