import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/format";
import { getEmployeeById } from "@/lib/data/employees";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: employee, error } = await getEmployeeById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!employee) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${employee.first_name} ${employee.last_name}`}
        description={<span className="capitalize">{employee.role.replace("_", " ")}</span>}
        action={<Badge tone={employee.is_active ? "accent" : "neutral"}>{employee.is_active ? "Active" : "Inactive"}</Badge>}
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
              {employee.drivers_license_number ?? "—"} {employee.drivers_license_state ? `(${employee.drivers_license_state})` : ""}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Hire Date</div>
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(employee.hire_date)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Login Access</div>
            <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {employee.user_id ? "Linked to a user account" : "Not yet linked — employee logins are not set up"}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
