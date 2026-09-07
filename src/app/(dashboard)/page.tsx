import { PageHeader } from "@/components/ui/page-header";
import { TodaysMission } from "@/components/command-center/todays-mission";
import { BusinessPulse } from "@/components/command-center/business-pulse";
import { AIAdvisorPanel } from "@/components/command-center/ai-advisor-panel";
import { getTodaysMission, getBusinessPulse } from "@/lib/data/command-center";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const [mission, pulse] = await Promise.all([getTodaysMission(), getBusinessPulse()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        description="Your operations at a glance — today's mission, business pulse, and the AI advisor."
      />

      <TodaysMission data={mission.data} error={mission.error} />
      <BusinessPulse data={pulse.data} error={pulse.error} />
      <AIAdvisorPanel />
    </div>
  );
}
