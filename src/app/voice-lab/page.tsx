import { CommandHero } from "@/components/command-center/command-hero";
import { AgentNetwork } from "@/components/command-center/agent-network";
import { buildBriefing } from "@/lib/jarvis/briefing";

// DEVELOPMENT-ONLY visual harness (404s in production). The numbers below are SAMPLE data
// shaped like a real Monday, used only to inspect layout at phone and desktop widths.
const sample = buildBriefing({
  name: "Nate",
  hour: 8,
  jobs: Array.from({ length: 10 }, (_, i) => ({ status: "scheduled", price: 50 + i * 5, budgeted_hours: null, scheduled_start_time: null, crewCount: 0 })),
});

export default function LabHome() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-warning)]">Voice lab — SAMPLE DATA, development only.</p>
      <h1 className="text-xl">Voice lab home</h1>
      <CommandHero briefing={sample} dataError={null} />
      <AgentNetwork />
    </div>
  );
}
