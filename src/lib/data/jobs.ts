import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import type {
  DataResult,
  Job,
  JobEquipment,
  JobMaterial,
  JobPhoto,
  JobStatus,
  JobWithRelations,
  TimeEntry,
} from "@/types/domain";

const JOB_RELATIONS_SELECT = `
  *,
  property:properties(*, client:clients(id, first_name, last_name, company_name)),
  service:services(id, name)
`;

export type JobFilters = {
  status?: JobStatus;
  from?: string;
  to?: string;
  routeId?: string;
};

export async function getJobs(filters: JobFilters = {}): Promise<DataResult<JobWithRelations[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("jobs")
      .select(JOB_RELATIONS_SELECT)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_start_time", { ascending: true, nullsFirst: true });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.from) query = query.gte("scheduled_date", filters.from);
    if (filters.to) query = query.lte("scheduled_date", filters.to);
    if (filters.routeId) query = query.eq("route_id", filters.routeId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as JobWithRelations[];
  });
}

export async function getJobsForDate(date: string): Promise<DataResult<JobWithRelations[]>> {
  return getJobs({ from: date, to: date });
}

export type JobDetail = JobWithRelations & {
  crew: { id: string; first_name: string; last_name: string | null; hours_worked: number | null }[];
  time_entries: TimeEntry[];
  equipment: (JobEquipment & { equipment: { id: string; name: string } | null })[];
  materials: JobMaterial[];
  photos: JobPhoto[];
};

export async function getJobById(id: string): Promise<DataResult<JobDetail>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: job, error } = await supabase
      .from("jobs")
      .select(JOB_RELATIONS_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;

    const [{ data: jobEmployees }, { data: timeEntries }, { data: equipment }, { data: materials }, { data: photos }] =
      await Promise.all([
        supabase
          .from("job_employees")
          .select("hours_worked, employee:employees(id, first_name, last_name)")
          .eq("job_id", id),
        supabase.from("time_entries").select("*").eq("job_id", id),
        supabase.from("job_equipment").select("*, equipment:equipment(id, name)").eq("job_id", id),
        supabase.from("job_materials").select("*").eq("job_id", id),
        supabase.from("job_photos").select("*").eq("job_id", id),
      ]);

    const crew = (jobEmployees ?? [])
      .map((je) => {
        const row = je as unknown as {
          hours_worked: number | null;
          employee: { id: string; first_name: string; last_name: string | null } | null;
        };
        return row.employee ? { ...row.employee, hours_worked: row.hours_worked } : null;
      })
      .filter((e): e is { id: string; first_name: string; last_name: string | null; hours_worked: number | null } => e !== null);

    return {
      ...(job as unknown as JobWithRelations),
      crew,
      time_entries: timeEntries ?? [],
      equipment: (equipment ?? []) as unknown as JobDetail["equipment"],
      materials: materials ?? [],
      photos: photos ?? [],
    };
  });
}

/** Production rate = job revenue / actual production hours. */
export function jobProductionRate(job: Pick<Job, "price" | "actual_hours">): number | null {
  if (!job.actual_hours || job.actual_hours <= 0 || !job.price) return null;
  return job.price / job.actual_hours;
}

// ---------------------------------------------------------------------------
// Workload summary — deterministic day-by-day rollup over a date range.
// Built for "how does Friday look" / "is this week overloaded" style
// questions: the caller (the AI tool layer, or a future schedule page) gets
// real per-day totals instead of having to sum a raw job list itself.
// ---------------------------------------------------------------------------

export type WorkloadDayJob = {
  id: string;
  client: string;
  property: string;
  service: string | null;
  status: string;
  price: number | null;
  budgeted_hours: number | null;
};

export type WorkloadDay = {
  date: string;
  job_count: number;
  expected_revenue: number;
  budgeted_hours: number;
  crew_assigned: string[];
  jobs: WorkloadDayJob[];
};

export type WorkloadSummary = {
  from: string;
  to: string;
  days: WorkloadDay[];
  total_job_count: number;
  total_expected_revenue: number;
  total_budgeted_hours: number;
};

/**
 * Cancelled jobs are excluded from workload math — they consume no crew
 * time and generate no revenue, so counting them would overstate the day.
 * Skipped jobs stay in (still real, unfinished obligations) and completed
 * jobs stay in too (this is a schedule/workload view across whatever range
 * is asked for, past or future, not just "what's left to do").
 */
export async function getWorkloadSummary(from: string, to: string): Promise<DataResult<WorkloadSummary>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(JOB_RELATIONS_SELECT)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_start_time", { ascending: true, nullsFirst: true });
    if (error) throw error;

    const jobList = (jobs ?? []) as unknown as JobWithRelations[];
    const jobIds = jobList.map((j) => j.id);

    const { data: jobEmployees } = jobIds.length
      ? await supabase
          .from("job_employees")
          .select("job_id, employee:employees(id, first_name, last_name)")
          .in("job_id", jobIds)
      : { data: [] };

    const crewByJob = new Map<string, string[]>();
    for (const je of jobEmployees ?? []) {
      const row = je as unknown as {
        job_id: string;
        employee: { id: string; first_name: string; last_name: string | null } | null;
      };
      if (!row.employee) continue;
      const name = [row.employee.first_name, row.employee.last_name].filter(Boolean).join(" ");
      const list = crewByJob.get(row.job_id) ?? [];
      list.push(name);
      crewByJob.set(row.job_id, list);
    }

    const dayMap = new Map<string, WorkloadDay>();
    for (const job of jobList) {
      const date = job.scheduled_date ?? "unscheduled";
      const day = dayMap.get(date) ?? { date, job_count: 0, expected_revenue: 0, budgeted_hours: 0, crew_assigned: [], jobs: [] };
      day.job_count += 1;
      day.expected_revenue += job.price ?? 0;
      day.budgeted_hours += job.budgeted_hours ?? 0;
      for (const name of crewByJob.get(job.id) ?? []) {
        if (!day.crew_assigned.includes(name)) day.crew_assigned.push(name);
      }
      day.jobs.push({
        id: job.id,
        client: clientDisplayName(job.property?.client),
        property: propertyAddress(job.property),
        service: job.service?.name ?? null,
        status: job.status,
        price: job.price,
        budgeted_hours: job.budgeted_hours,
      });
      dayMap.set(date, day);
    }

    const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      from,
      to,
      days,
      total_job_count: jobList.length,
      total_expected_revenue: days.reduce((sum, d) => sum + d.expected_revenue, 0),
      total_budgeted_hours: days.reduce((sum, d) => sum + d.budgeted_hours, 0),
    };
  });
}
