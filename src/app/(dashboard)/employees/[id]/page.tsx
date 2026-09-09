import Link from "next/link";
import { Pencil, Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDateOnly, formatHours } from "@/lib/format";
import { getEmployeeById, getEmployeeRecentJobs } from "@/lib/data/employees";
import { updateEmployee, archiveEmployee } from "@/lib/actions/employees";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, error: formError } = await searchParams;
  const [{ data: employee, error }, { data: recentJobs }] = await Promise.all([
    getEmployeeById(id),
    getEmployeeRecentJobs(id),
  ]);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!employee) return null;

  const updateEmployeeWithId = updateEmployee.bind(null, id);
  const archiveEmployeeWithId = archiveEmployee.bind(null, id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={[employee.first_name, employee.last_name].filter(Boolean).join(" ")}
        description={<span className="capitalize">{(employee.role ?? "crew_member").replace("_", " ")}</span>}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={employee.active ? "accent" : "neutral"}>{employee.active ? "Active" : "Inactive"}</Badge>
            <Link href={`/employees/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {employee.active ? (
              <form action={archiveEmployeeWithId}>
                <ConfirmSubmit confirmMessage={`Mark ${employee.first_name} as inactive? Their job history stays intact.`}>
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
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Hourly Rate</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatCurrency(employee.hourly_rate ?? 0, true)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Phone / Email</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{employee.phone ?? "—"}</div>
            <div className="text-sm text-[var(--color-text-secondary)]">{employee.email ?? "—"}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Driver&apos;s License</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">
              {employee.has_drivers_license ? "On file" : "Not on file"}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Hire Date</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDateOnly(employee.hire_date)}</div>
          </CardBody>
        </Card>
      </div>

      {employee.notes ? (
        <Card>
          <CardBody>
            <div className="mb-1 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Notes</div>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{employee.notes}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Assigned Jobs" description="Most recent 15" />
        <CardBody>
          {!recentJobs || recentJobs.length === 0 ? (
            <EmptyState title="No jobs assigned yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recentJobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                  >
                    <span>{formatDateOnly(j.scheduled_date)} — {j.service?.name ?? "Job"}</span>
                    <div className="flex items-center gap-3">
                      {j.hours_worked !== null ? (
                        <span className="text-xs text-[var(--color-text-muted)]">{formatHours(j.hours_worked)}</span>
                      ) : null}
                      <StatusBadge status={j.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Employee" closeHref={`/employees/${id}`}>
          <EmployeeForm action={updateEmployeeWithId} employee={employee} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
