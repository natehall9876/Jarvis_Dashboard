import { PageHeader } from "@/components/ui/page-header";
import { TodaysMission } from "@/components/command-center/todays-mission";
import { BusinessPulse } from "@/components/command-center/business-pulse";
import { AIAdvisorPanel } from "@/components/command-center/ai-advisor-panel";
import { WeatherCard } from "@/components/command-center/weather-card";
import { getTodaysMission, getBusinessPulse } from "@/lib/data/command-center";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const [mission, pulse] = await Promise.all([getTodaysMission(), getBusinessPulse()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        description="Your operations at a glance — today's mission, business pulse, and the AI advisor."
        action={
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            </span>
            LIVE
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodaysMission data={mission.data} error={mission.error} />
        </div>
        <WeatherCard />
      </div>

      <BusinessPulse data={pulse.data} error={pulse.error} />
      <AIAdvisorPanel />
    </div>
  );
}
