import { OperationalReceivables } from "@/components/command-center/operational-receivables";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CommandHero } from "@/components/command-center/command-hero";
import { Suspense } from "react";
import { OwnerOperations } from "@/components/command-center/owner-operations";
import { QuickBooksMoney, CalendarAgenda } from "@/components/command-center/live-integrations";
import { TasksCard } from "@/components/command-center/tasks-card";
import { getOpenTasks } from "@/lib/data/notes-tasks";
import { BRAND } from "@/components/layout/nav-config";
import { buildBriefing, hourInZone } from "@/lib/jarvis/briefing";
import { addDaysISO, todayInZone } from "@/lib/integrations/homeworks-dates";
import { TodaysMission } from "@/components/command-center/todays-mission";
import { UpcomingWork } from "@/components/command-center/upcoming-work";
import { WeatherCard } from "@/components/command-center/weather-card";
import { getTodaysMission } from "@/lib/data/command-center";
import { getWorkloadSummary } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  // Business-local (America/New_York) days — the UTC date is already "tomorrow" after 8 PM Eastern.
  const today = todayInZone();
  const tomorrow = addDaysISO(today, 1);
  const weekOut = addDaysISO(today, 7);

  const [mission, upcoming, tasks] = await Promise.all([getTodaysMission(), getWorkloadSummary(tomorrow, weekOut), getOpenTasks()]);

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
        <CommandHero briefing={briefing} dataError={mission.error ?? (mission.data?.unavailableSections?.length ? "Some business data could not be checked. See Today's Mission." : null)} />
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

      <Suspense fallback={<p role="status">Checking owner priorities and this week&apos;s work…</p>}><OwnerOperations /></Suspense>
      <Suspense fallback={<p role="status">Loading recorded receivables…</p>}><OperationalReceivables /></Suspense>
      <Suspense fallback={<p role="status">Reading QuickBooks…</p>}><QuickBooksMoney /></Suspense>
      <Suspense fallback={<p role="status">Checking Google Calendar…</p>}><CalendarAgenda /></Suspense>

      <div className="animate-fade-in" style={{ animationDelay: "60ms" }}>
        <UpcomingWork data={upcoming.data} error={upcoming.error} />
      </div>


    </div>
  );
}
