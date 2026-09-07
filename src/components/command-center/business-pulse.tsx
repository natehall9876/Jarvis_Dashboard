import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatPercent } from "@/lib/format";
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
      <CardHeader title="Business Pulse" description="Trailing performance, updated in real time from Supabase" />
      <CardBody>
        <DataStateGate error={error} isEmpty={false}>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <StatTile label="Revenue Today" value={formatCurrency(data.revenueToday)} tone="accent" />
              <StatTile label="Revenue This Week" value={formatCurrency(data.revenueWeek)} tone="accent" />
              <StatTile label="Revenue This Month" value={formatCurrency(data.revenueMonth)} tone="accent" />
              <StatTile
                label="Accounts Receivable"
                value={formatCurrency(data.accountsReceivable)}
                sublabel={`${data.outstandingInvoiceCount} outstanding`}
                tone={data.accountsReceivable > 0 ? "warning" : "neutral"}
              />
              <StatTile label="Cash Collected (Mo.)" value={formatCurrency(data.cashCollectedMonth)} />
              <StatTile
                label="Production $ / Hour"
                value={data.productionDollarsPerHour !== null ? formatCurrency(data.productionDollarsPerHour, true) : "—"}
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
