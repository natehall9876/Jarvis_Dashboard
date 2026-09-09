import { getTodaysMission, getBusinessPulse } from "@/lib/data/command-center";
import { getAttentionItems, type AttentionReport } from "@/lib/data/attention";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import type { BusinessPulse } from "@/lib/data/command-center";
import type { DataResult } from "@/types/domain";

export type OwnerBriefing = {
  date: string;
  today: {
    job_count: number;
    expected_revenue: number;
    budgeted_hours: number;
    crew_working: string[];
    routes_running: number;
    jobs: { id: string; client: string; property: string; service: string | null; price: number | null }[];
  };
  attention: AttentionReport;
  pulse: BusinessPulse;
};

/**
 * The single deterministic payload behind "give me my owner briefing" and
 * "what needs my attention" — assembled from three existing data sources in
 * one parallel fetch rather than making the model chain three separate tool
 * calls (and rather than re-deriving any of this math itself). The model's
 * job on top of this is purely the "JARVIS RECOMMENDS" synthesis.
 */
export async function getOwnerBriefing(): Promise<DataResult<OwnerBriefing>> {
  const [missionResult, pulseResult, attentionResult] = await Promise.all([
    getTodaysMission(),
    getBusinessPulse(),
    getAttentionItems(),
  ]);

  if (missionResult.error !== null) return { data: null, error: missionResult.error };
  if (pulseResult.error !== null) return { data: null, error: pulseResult.error };
  if (attentionResult.error !== null) return { data: null, error: attentionResult.error };

  const mission = missionResult.data;

  return {
    data: {
      date: mission.date,
      today: {
        job_count: mission.jobCount,
        expected_revenue: mission.expectedRevenue,
        budgeted_hours: mission.budgetedHours,
        crew_working: mission.crewWorking.map((c) => c.name),
        routes_running: mission.routesRunning.length,
        jobs: mission.jobs
          .filter((j) => j.status !== "cancelled")
          .map((j) => ({
            id: j.id,
            client: clientDisplayName(j.property?.client),
            property: propertyAddress(j.property),
            service: j.service?.name ?? null,
            price: j.price,
          })),
      },
      attention: attentionResult.data,
      pulse: pulseResult.data,
    },
    error: null,
  };
}
