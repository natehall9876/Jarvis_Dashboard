import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CommandHero } from "@/components/command-center/command-hero";
import { AgentNetwork } from "@/components/command-center/agent-network";
import { TasksCard } from "@/components/command-center/tasks-card";
import { getOpenTasks } from "@/lib/data/notes-tasks";
import { BRAND } from "@/components/layout/nav-config";
import { buildBriefing, hourInZone } from "@/lib/jarvis/briefing";
import { addDaysISO, todayInZone } from "@/lib/integrations/homeworks-dates";
import { TodaysMission } from "@/components/command-center/todays-mission";
import { UpcomingWork } from "@/components/command-center/upcoming-work";
import { BusinessPulse } from "@/components/command-center/business-pulse";
import { WeatherCard } from "@/components/command-center/weather-card";
import { getTodaysMission, getBusinessPulse } from "@/lib/data/command-center";
import { getWorkloadSummary } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  // Business-local (America/New_York) days — the UTC date is already "tomorrow" after 8 PM Eastern.
  const today = todayInZone();
  const tomorrow = addDaysISO(today, 1);
  const weekOut = addDaysISO(today, 7);

  const [mission, pulse, upcoming, tasks] = await Promise.all([getTodaysMission(), getBusinessPulse(), getWorkloadSummary(tomorrow, weekOut), getOpenTasks()]);

  // The briefing is built only from today's real job rows; confirmed demo
  // records are excluded exactly as they are from the mission totals.
  const briefing = mission.data
    ? buildBriefing({
        name: BRAND.ownerFirstName,
        hour: hourInZone(new Date()),
        jobs: mission.data.jobs
          .filter((j) => (j.property?.client as { data_source?: string } | null | undefined)?.data_source !== "demo")
          .map((j) => ({
            status: j.status,
            price: j.price,
            budgeted_hours: j.budgeted_hours,
            scheduled_start_time: j.scheduled_start_time,
            crewCount: mission.data?.crewCountByJob[j.id] ?? 0,
          })),
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <CommandHero briefing={briefing} dataError={mission.error} />
      </div>

      {/* Explicit grid-cols-1 matters here, not just cosmetic: Tailwind's
          `grid` utility alone sets display:grid with no grid-template-columns,
          so a single implicit mobile column sizes to its content's
          max-content width (auto) instead of the container's available
          width — found live at 375px width: it forced ~506px wide, pushing
          the whole page into horizontal scroll. `grid-cols-1` (repeat(1,
          minmax(0,1fr))) is what actually clamps it. */}
      <div className="grid animate-fade-in grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodaysMission data={mission.data} error={mission.error} />
        </div>
        <WeatherCard />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "30ms" }}>
        <Card>
          <CardHeader title="Your tasks" description="Reminders and to-dos — add them here or just tell Jarvis" />
          <CardBody>
            <TasksCard tasks={tasks.data} needsMigration={tasks.needsMigration} error={tasks.error} today={today} />
          </CardBody>
        </Card>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "40ms" }}>
        <Card>
          <CardHeader title="Jarvis capabilities" description="What Jarvis is actually connected to today — tap any capability to open it." />
          <CardBody>
            <AgentNetwork />
          </CardBody>
        </Card>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "60ms" }}>
        <UpcomingWork data={upcoming.data} error={upcoming.error} />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "80ms" }}>
        <BusinessPulse data={pulse.data} error={pulse.error} />
      </div>
    </div>
  );
}
