import type { JobWithRelations } from "@/types/domain";

export type ScheduleRouteStop = {
  id: string; property_id: string; route_id: string; stop_order: number | null;
  route: { id: string; active: boolean; route_day: string | null } | null;
};
export function weekdayForDate(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}
/** Source route order wins. An owner route preference orders existing visits only. */
export function orderScheduleJobs(jobs: JobWithRelations[], stops: ScheduleRouteStop[]): JobWithRelations[] {
  return jobs.filter(job => job.property?.client?.data_source !== "demo" && !(job as JobWithRelations & {homeworks_deleted?:boolean}).homeworks_deleted)
    .map(job => {
      if (job.stop_order != null || !job.scheduled_date) return job;
      const candidates = stops.filter(stop => stop.property_id === job.property_id && stop.route?.active &&
        (job.route_id ? stop.route_id === job.route_id : stop.route.route_day?.toLowerCase() === weekdayForDate(job.scheduled_date!).toLowerCase()));
      // Ambiguous route membership must never silently choose one.
      return candidates.length === 1 ? { ...job, route_id: candidates[0].route_id, stop_order: candidates[0].stop_order } : job;
    })
    .sort((a,b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999") ||
      (a.stop_order ?? Number.MAX_SAFE_INTEGER) - (b.stop_order ?? Number.MAX_SAFE_INTEGER) ||
      (a.scheduled_start_time ?? "99:99").localeCompare(b.scheduled_start_time ?? "99:99") || a.id.localeCompare(b.id));
}
