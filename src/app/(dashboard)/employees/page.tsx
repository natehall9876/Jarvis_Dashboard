import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmployeeForm } from "@/components/employees/employee-form";
import { formatCurrency, formatHours } from "@/lib/format";
import { getEmployees } from "@/lib/data/employees";
import { createEmployee } from "@/lib/actions/employees";
import type { EmployeeWithStats } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string; source?: string }>;
}) {
  const { new: isNew, error: formError, source } = await searchParams;
  const { data: employees, error } = await getEmployees();

  const localUnverified = (employees ?? []).filter((e) => !e.homeworks_id);
  const synced = (employees ?? []).filter((e) => !!e.homeworks_id && !e.homeworks_deleted);
  const visibleEmployees = source === "local" ? localUnverified : source === "homeworks" ? synced : employees;

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
    { key: "source", header: "Record source", render: (e) => <Badge tone={e.homeworks_id ? "accent" : "neutral"}>{e.homeworks_id ? (e.homeworks_deleted ? "Homeworks archived" : "Homeworks") : "Local · verify"}</Badge> },
    { key: "rate", header: "Hourly Rate", align: "right", hideOnMobile: true, render: (e) => formatCurrency(e.hourly_rate ?? 0, true) },
    { key: "status", header: "Active", render: (e) => <Badge tone={e.active ? "accent" : "neutral"}>{e.active ? "Active" : "Inactive"}</Badge> },
    { key: "license", header: "Driver's License", hideOnMobile: true, render: (e) => (e.has_drivers_license ? "Yes" : "No") },
    { key: "hours", header: "Hours This Week", align: "right", render: (e) => formatHours(e.hours_this_week) },
    { key: "labor", header: "Labor Cost", align: "right", hideOnMobile: true, render: (e) => formatCurrency(e.labor_cost_this_week) },
    { key: "jobs", header: "Jobs This Week", align: "right", hideOnMobile: true, render: (e) => e.jobs_worked_this_week },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Crew roster, hourly rates, and this week's production contribution."
        action={
          <Link href="/employees?new=1">
            <Button>
              <Plus className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        }
      />
      {employees && localUnverified.length > 0 ? (
        <div role="status" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          <strong className="text-[var(--color-text-primary)]">Roster verification needed.</strong> {localUnverified.length} locally created employee record{localUnverified.length === 1 ? "" : "s"} cannot be verified against Homeworks automatically. {synced.length} current Homeworks record{synced.length === 1 ? "" : "s"} identified. Review the local entries before using roster totals for payroll or scheduling. Nothing has been deleted.
        </div>
      ) : null}
      {employees ? (
        <nav aria-label="Filter employees by source" className="flex flex-wrap gap-2 text-xs font-semibold">
          {[
            { label: `All (${employees.length})`, href: "/employees", selected: !source },
            { label: `Homeworks (${synced.length})`, href: "/employees?source=homeworks", selected: source === "homeworks" },
            { label: `Review local (${localUnverified.length})`, href: "/employees?source=local", selected: source === "local" },
          ].map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.selected ? "page" : undefined} className={`rounded-lg border px-3 py-2 transition-colors ${tab.selected ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>{tab.label}</Link>)}
        </nav>
      ) : null}
      <Card>
        <DataStateGate error={error} isEmpty={!!visibleEmployees && visibleEmployees.length === 0} emptyTitle="No employees yet">
          {visibleEmployees ? <DataTable columns={columns} rows={visibleEmployees} getRowKey={(e) => e.id} onRowHref={(e) => `/employees/${e.id}`} /> : null}
        </DataStateGate>
      </Card>

      {isNew ? (
        <Modal title="Add Employee" closeHref="/employees">
          <EmployeeForm action={createEmployee} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
