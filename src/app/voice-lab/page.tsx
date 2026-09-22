import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CommandHero } from "@/components/command-center/command-hero";
import { AgentNetwork } from "@/components/command-center/agent-network";
import { TasksCard } from "@/components/command-center/tasks-card";
import { TodaysMission } from "@/components/command-center/todays-mission";
import { UpcomingWork } from "@/components/command-center/upcoming-work";
import { BusinessPulse } from "@/components/command-center/business-pulse";
import { WeatherCard } from "@/components/command-center/weather-card";
import { buildBriefing } from "@/lib/jarvis/briefing";
import type { TodaysMission as TodaysMissionData, BusinessPulse as BusinessPulseData, PriorityItem } from "@/lib/data/command-center";
import type { WorkloadSummary } from "@/lib/data/jobs";
import type { OwnerTask } from "@/lib/data/notes-tasks";
import type { JobWithRelations } from "@/types/domain";

/**
 * FIXTURE DATA — not real, not read from any database. Renders the REAL
 * Command Center page's own components (CommandHero, TodaysMission,
 * WeatherCard, TasksCard, AgentNetwork, UpcomingWork, BusinessPulse — the
 * exact same imports the real (dashboard)/page.tsx uses) instead of a
 * hand-built lookalike, for the same reason job-detail-view.tsx was
 * extracted: a hand-copied twin drifts. Command Center's real page was
 * already composed of independent, data-as-props components (no extraction
 * needed here, unlike the job page) — WeatherCard and AgentNetwork are
 * async Server Components that fetch their OWN real data internally
 * (weather, integration status), so they render genuinely live here too;
 * everything else takes fixture props. Mostly minimal/empty values
 * (0, [], null) rather than elaborately realistic ones — deliberately, so
 * this also serves as an honest "what does an empty day look like" check
 * (the codebase's own stated preference: "honest empty states" over
 * fabricated placeholder numbers), with just enough non-empty data
 * (priorities, one task) to exercise those sections too.
 */

const sampleJobs: JobWithRelations[] = Array.from({ length: 10 }, (_, i) => ({
  id: `lab-job-${i}`,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  property_id: `lab-property-${i}`,
  service_id: "lab-service-1",
  service_agreement_id: null,
  route_id: null,
  scheduled_date: "2026-09-24",
  scheduled_start_time: null,
  stop_order: null,
  status: "scheduled",
  price: 50 + i * 5,
  budgeted_hours: null,
  actual_hours: null,
  crew_size: null,
  notes: null,
  completion_notes: null,
  started_at: null,
  completed_at: null,
  homeworks_id: `hw-${i}`,
  property: null,
  service: { id: "lab-service-1", name: "Lawn Maintenance" },
})) as unknown as JobWithRelations[];

const samplePriorities: PriorityItem[] = [
  { label: "2 schedule conflicts today", detail: "Marcus Diallo is double-booked at 9:00 AM and 9:30 AM.", severity: "critical", href: "/schedule" },
  { label: "3 overdue tasks", detail: "Oldest: \"Call back Rob Elliot about the fence line\" — 4 days overdue.", severity: "warning", href: "/" },
  { label: "1 quote awaiting follow-up", detail: "Estimate #2026-041 sent 5 days ago, no response yet.", severity: "info", href: "/quotes" },
];

const sampleMission: TodaysMissionData = {
  date: "2026-09-24",
  jobs: sampleJobs,
  jobCount: sampleJobs.length,
  expectedRevenue: sampleJobs.reduce((n, j) => n + (j.price ?? 0), 0),
  budgetedHours: 0,
  crewWorking: [],
  crewCountByJob: {},
  routesRunning: [],
  scheduleChanges: [],
  quotesNeedingFollowUp: [],
  overdueInvoices: [],
  equipmentIssues: [],
  priorities: samplePriorities,
};

const sampleUpcoming: WorkloadSummary = { from: "2026-09-25", to: "2026-10-01", days: [], total_job_count: 0, total_expected_revenue: 0, total_budgeted_hours: 0 };

const sampleTasks: OwnerTask[] = [
  { id: "lab-task-1", createdAt: "2026-09-20T12:00:00Z", title: "Call back Rob Elliot about the fence line", notes: null, dueDate: "2026-09-20", status: "open", source: "owner", jobId: null },
];

const samplePulse: BusinessPulseData = {
  revenueToday: 725,
  revenueWeek: 3200,
  revenueMonth: 14850,
  accountsReceivable: 0,
  cashCollectedMonth: 0,
  outstandingInvoiceCount: 0,
  productionDollarsPerHour: null,
  truePaidDollarsPerHour: null,
  totalPaidHoursMonth: 0,
  laborCostMonth: 0,
  grossProfitMonth: 0,
  averageTicketMonth: null,
  jobsCompletedMonth: 0,
  quoteAcceptanceRatePct: null,
  crewHourTarget: 130,
} as unknown as BusinessPulseData;

const sample = buildBriefing({
  name: "Nate",
  hour: 8,
  jobs: sampleJobs.map((j) => ({ status: j.status, price: j.price, budgeted_hours: j.budgeted_hours, scheduled_start_time: j.scheduled_start_time, crewCount: 0 })),
});

export default function LabHome() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-warning)]">Voice lab — SAMPLE DATA, development only.</p>
      <h1 className="text-xl">Voice lab home</h1>

      <CommandHero briefing={sample} dataError={null} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodaysMission data={sampleMission} error={null} />
        </div>
        <WeatherCard />
      </div>

      <Card>
        <CardHeader title="Your tasks" description="Reminders and to-dos — add them here or just tell Jarvis" />
        <CardBody>
          <TasksCard tasks={sampleTasks} needsMigration={false} error={null} today="2026-09-22" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Jarvis capabilities" description="What Jarvis is actually connected to today — tap any capability to open it." />
        <CardBody>
          <AgentNetwork />
        </CardBody>
      </Card>

      <UpcomingWork data={sampleUpcoming} error={null} />

      <BusinessPulse data={samplePulse} error={null} />
    </div>
  );
}
