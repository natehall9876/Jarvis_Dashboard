import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataStateGate, EmptyState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getReportsSummary } from "@/lib/data/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { data, error } = await getReportsSummary(90);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Trailing 90-day performance across revenue, production, labor, and quotes." />

      <DataStateGate error={error} isEmpty={false}>
        {data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="Total Revenue" value={formatCurrency(data.totalRevenue)} tone="accent" />
              <StatTile label="Total Labor Cost" value={formatCurrency(data.totalLaborCost)} />
              <StatTile
                label="Labor Cost %"
                value={data.laborCostPct !== null ? formatPercent(data.laborCostPct) : "—"}
              />
              <StatTile label="Jobs Completed" value={data.jobsCompleted} />
              <StatTile
                label="Quote Acceptance"
                value={data.quoteAcceptancePct !== null ? formatPercent(data.quoteAcceptancePct) : "—"}
              />
            </div>

            <Card>
              <CardHeader title="Revenue by Service" description="Profitability and $/hour by service type" />
              <CardBody>
                {data.byService.length === 0 ? (
                  <EmptyState title="No completed jobs in this window" />
                ) : (
                  <ReportTable
                    rows={data.byService.map((s) => ({
                      label: s.serviceName,
                      jobCount: s.jobCount,
                      revenue: s.revenue,
                      perHour: s.revenuePerHour,
                    }))}
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Revenue by Client" description="Top 10 clients by revenue — click through to drill in" />
              <CardBody>
                {data.byClient.length === 0 ? (
                  <EmptyState title="No completed jobs in this window" />
                ) : (
                  <ReportTable
                    rows={data.byClient.map((c) => ({
                      label: c.clientName,
                      jobCount: c.jobCount,
                      revenue: c.revenue,
                      perHour: null,
                      href: `/clients/${c.clientId}`,
                    }))}
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Revenue by Route" description="Route-level production efficiency — click through to drill in" />
              <CardBody>
                {data.byRoute.length === 0 ? (
                  <EmptyState title="No completed jobs in this window" />
                ) : (
                  <ReportTable
                    rows={data.byRoute.map((r) => ({
                      label: r.routeName,
                      jobCount: r.jobCount,
                      revenue: r.revenue,
                      perHour: r.revenuePerHour,
                      href: `/routes/${r.routeId}`,
                    }))}
                  />
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </DataStateGate>
    </div>
  );
}

function ReportTable({
  rows,
}: {
  rows: { label: string; jobCount: number; revenue: number; perHour: number | null; href?: string }[];
}) {
  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          <th className="py-2 text-left font-medium">Name</th>
          <th className="hidden py-2 text-left font-medium sm:table-cell">Share</th>
          <th className="py-2 text-right font-medium">Jobs</th>
          <th className="py-2 text-right font-medium">Revenue</th>
          <th className="py-2 text-right font-medium">$ / Hour</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={`border-b border-[var(--color-border)] last:border-0 ${row.href ? "hover:bg-[var(--color-surface-2)]" : ""}`}>
            <td className="py-2">
              {row.href ? (
                <Link href={row.href} className="text-[var(--color-text-primary)] hover:text-[var(--color-accent)] hover:underline">
                  {row.label}
                </Link>
              ) : (
                <span className="text-[var(--color-text-primary)]">{row.label}</span>
              )}
            </td>
            <td className="hidden py-2 pr-4 sm:table-cell">
              <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.max(3, (row.revenue / maxRevenue) * 100)}%` }} />
              </div>
            </td>
            <td className="py-2 text-right text-[var(--color-text-secondary)]">{row.jobCount}</td>
            <td className="py-2 text-right font-medium text-[var(--color-text-primary)]">{formatCurrency(row.revenue)}</td>
            <td className="py-2 text-right text-[var(--color-text-secondary)]">
              {row.perHour !== null ? formatCurrency(row.perHour, true) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
