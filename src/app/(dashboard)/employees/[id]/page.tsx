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
        title={[employee.first_name, employee.last_name].filter(Boolean).join(" ")}
        description={<span className="capitalize">{(employee.role ?? "crew_member").replace("_", " ")}</span>}
        action={<Badge tone={employee.active ? "accent" : "neutral"}>{employee.active ? "Active" : "Inactive"}</Badge>}
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
            <div className="mt-1 text-sm text-[var(--color-text-primary)]">{formatDate(employee.hire_date)}</div>
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
    </div>
  );
}
