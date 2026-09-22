/**
 * Schedule conflict detection. Pure and framework-free, same pattern as
 * lib/calculations.ts. A conflict is only ever reported from data that is
 * actually present — a job with no set start time and no budgeted duration
 * cannot overlap anything, so it is silently excluded rather than guessed at.
 */
export type ConflictJob = {
  id: string;
  label: string;
  crew: string[];
  scheduledStartTime: string | null;
  /** Hours, used as the assumed on-site duration when a real time is known. */
  budgetedHours: number | null;
};

export type ScheduleConflict = {
  crewMember: string;
  jobA: { id: string; label: string; start: string; end: string };
  jobB: { id: string; label: string; start: string; end: string };
};

const DEFAULT_DURATION_HOURS = 1;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Jobs on ONE calendar day for ONE crew member whose timed windows overlap.
 * Duration comes from budgeted_hours when set; a timed job with no budgeted
 * hours falls back to a conservative 1-hour window rather than being
 * skipped, since two jobs starting at the same minute for the same person
 * is a conflict regardless of how long either one is expected to take.
 * All-day (untimed) jobs never participate — there is nothing to overlap.
 */
export function detectScheduleConflicts(jobsOnDay: ConflictJob[]): ScheduleConflict[] {
  const byCrew = new Map<string, (ConflictJob & { startMin: number; endMin: number })[]>();
  for (const job of jobsOnDay) {
    if (!job.scheduledStartTime) continue;
    const startMin = toMinutes(job.scheduledStartTime);
    const durationHours = job.budgetedHours && job.budgetedHours > 0 ? job.budgetedHours : DEFAULT_DURATION_HOURS;
    const endMin = startMin + durationHours * 60;
    for (const member of job.crew) {
      const list = byCrew.get(member) ?? [];
      list.push({ ...job, startMin, endMin });
      byCrew.set(member, list);
    }
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [member, jobs] of byCrew) {
    const sorted = [...jobs].sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startMin >= sorted[i].endMin) break; // sorted by start, so nothing further can overlap sorted[i]
        conflicts.push({
          crewMember: member,
          jobA: { id: sorted[i].id, label: sorted[i].label, start: fromMinutes(sorted[i].startMin), end: fromMinutes(sorted[i].endMin) },
          jobB: { id: sorted[j].id, label: sorted[j].label, start: fromMinutes(sorted[j].startMin), end: fromMinutes(sorted[j].endMin) },
        });
      }
    }
  }
  return conflicts;
}
