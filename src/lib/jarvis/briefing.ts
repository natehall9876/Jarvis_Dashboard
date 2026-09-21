/**
 * Builds the Command Center briefing strictly from real job rows. Every
 * clause is conditional on data actually being present; nothing is invented.
 */
export type BriefingJob = {
  status: string;
  price: number | null;
  budgeted_hours: number | null;
  scheduled_start_time: string | null;
  crewCount: number;
};

export type Briefing = {
  greeting: string;
  headline: string;
  facts: { label: string; value: string; tone: "ok" | "warn" | "muted" }[];
  counts: { jobs: number; scheduledRevenue: number; budgetedHours: number; missingHours: number; unscheduledTime: number; unassigned: number };
};

export type JobCounts = Briefing["counts"];

/** Counts over the jobs that will actually be worked (cancelled and skipped are excluded). Missing data is counted, never assumed. */
export function summarizeJobs(jobs: BriefingJob[]): JobCounts {
  const active = jobs.filter((j) => j.status !== "cancelled" && j.status !== "skipped");
  return {
    jobs: active.length,
    scheduledRevenue: active.reduce((s, j) => s + (j.price ?? 0), 0),
    budgetedHours: active.reduce((s, j) => s + (j.budgeted_hours ?? 0), 0),
    missingHours: active.filter((j) => j.budgeted_hours == null || j.budgeted_hours <= 0).length,
    unscheduledTime: active.filter((j) => !j.scheduled_start_time).length,
    unassigned: active.filter((j) => j.crewCount === 0).length,
  };
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Local hour in the business timezone for the given instant. */
export function hourInZone(now: Date, timeZone = "America/New_York"): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(now)) % 24;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildBriefing(input: { name?: string; hour: number; jobs: BriefingJob[]; dayLabel?: string }): Briefing {
  const counts = summarizeJobs(input.jobs);
  const active = { length: counts.jobs };
  const { scheduledRevenue, budgetedHours, missingHours, unscheduledTime, unassigned } = counts;
  const day = input.dayLabel ?? "today";

  const greeting = `${greetingForHour(input.hour)}${input.name ? `, ${input.name}` : ""}.`;
  let headline: string;
  if (active.length === 0) headline = `You have no jobs scheduled ${day}.`;
  else headline = `You have ${plural(active.length, "job")} scheduled ${day}.`;

  const facts: Briefing["facts"] = [];
  if (active.length > 0) {
    facts.push({ label: "Scheduled revenue", value: `$${scheduledRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })} (not yet earned)`, tone: "ok" });
    facts.push(
      missingHours === active.length
        ? { label: "Budgeted labor", value: "No budgeted hours recorded", tone: "warn" }
        : { label: "Budgeted labor", value: `${budgetedHours.toFixed(1)} hr${missingHours ? ` (${missingHours} without hours)` : ""}`, tone: missingHours ? "warn" : "ok" },
    );
    facts.push({ label: "Appointment times", value: unscheduledTime === active.length ? "All unscheduled (no set times)" : `${unscheduledTime} unscheduled`, tone: unscheduledTime ? "muted" : "ok" });
    facts.push({ label: "Crew assigned", value: unassigned === active.length ? "None assigned" : `${unassigned} unassigned`, tone: unassigned ? "warn" : "ok" });
  }

  return { greeting, headline, facts, counts };
}
