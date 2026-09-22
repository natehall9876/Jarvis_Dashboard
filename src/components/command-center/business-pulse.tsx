import { TrendingUp } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatPercent } from "@/lib/format";
import { targetGapPercent } from "@/lib/calculations";
import type { BusinessPulse as BusinessPulseData } from "@/lib/data/command-center";

export function BusinessPulse({
  data,
  error,
}: {
  data: BusinessPulseData | null;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--color-accent)]" />
            Business Pulse
          </span>
        }
        description="Trailing performance, updated in real time from Supabase"
      />
      <CardBody>
        <DataStateGate error={error} isEmpty={false}>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <StatTile label="Completed Job Revenue — Today" value={formatCurrency(data.revenueToday)} tone="accent" sublabel="Work finished, not necessarily paid" />
              <StatTile label="Completed Job Revenue — This Week" value={formatCurrency(data.revenueWeek)} tone="accent" sublabel="Work finished, not necessarily paid" />
              <StatTile label="Completed Job Revenue — This Month" value={formatCurrency(data.revenueMonth)} tone="accent" sublabel="Work finished, not necessarily paid" />
              <StatTile
                label="Cash Collected (Mo.)"
                value={formatCurrency(data.cashCollectedMonth)}
                tone="accent"
                sublabel="The only figure below that is actually money in hand"
              />
              <StatTile
                label="Accounts Receivable"
                value={formatCurrency(data.accountsReceivable)}
                sublabel={`${data.outstandingInvoiceCount} outstanding — invoiced, not yet collected`}
                tone={data.accountsReceivable > 0 ? "warning" : "neutral"}
              />
              <StatTile
                label="Scheduled Revenue (Mo.)"
                value={formatCurrency(data.scheduledRevenueMonth)}
                sublabel="Every non-cancelled job on the board this month — a projection, not a result"
              />
              <StatTile
                label="Pending Estimates"
                value={formatCurrency(data.pendingEstimatesValue)}
                sublabel={`${data.pendingEstimatesCount} sent, awaiting a decision`}
              />
              <StatTile
                label="Field Production $/Hr"
                value={data.productionDollarsPerHour !== null ? formatCurrency(data.productionDollarsPerHour, true) : "—"}
                sublabel={
                  targetGapPercent(data.productionDollarsPerHour, data.crewHourTarget) !== null
                    ? `${formatPercent(Math.abs(targetGapPercent(data.productionDollarsPerHour, data.crewHourTarget)!))} ${targetGapPercent(data.productionDollarsPerHour, data.crewHourTarget)! >= 0 ? "above" : "below"} the $${data.crewHourTarget}/hr target`
                    : "Revenue ÷ on-site job hours"
                }
                tone={data.productionDollarsPerHour !== null && data.productionDollarsPerHour < data.crewHourTarget ? "warning" : "neutral"}
              />
              <StatTile
                label="True Paid $/Hr"
                value={data.truePaidDollarsPerHour !== null ? formatCurrency(data.truePaidDollarsPerHour, true) : "—"}
                sublabel={`Revenue ÷ all ${data.totalPaidHoursMonth.toFixed(0)} paid crew hours`}
                tone={
                  data.truePaidDollarsPerHour !== null && data.truePaidDollarsPerHour < data.crewHourTarget
                    ? "warning"
                    : data.productionDollarsPerHour !== null &&
                        data.truePaidDollarsPerHour !== null &&
                        data.truePaidDollarsPerHour < data.productionDollarsPerHour * 0.8
                      ? "warning"
                      : "neutral"
                }
              />
              <StatTile label="Labor Cost (Mo.)" value={formatCurrency(data.laborCostMonth)} />
              <StatTile
                label="Gross Profit (Mo.)"
                value={formatCurrency(data.grossProfitMonth)}
                tone={data.grossProfitMonth >= 0 ? "accent" : "critical"}
              />
              <StatTile
                label="Average Ticket"
                value={data.averageTicketMonth !== null ? formatCurrency(data.averageTicketMonth, true) : "—"}
              />
              <StatTile label="Jobs Completed (Mo.)" value={data.jobsCompletedMonth} />
              <StatTile
                label="Quote Acceptance Rate"
                value={data.quoteAcceptanceRatePct !== null ? formatPercent(data.quoteAcceptanceRatePct) : "—"}
              />
            </div>
          ) : null}
        </DataStateGate>
      </CardBody>
    </Card>
  );
}
