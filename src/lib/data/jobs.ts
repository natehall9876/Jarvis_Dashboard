import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
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
  client:clients(id, name, company_name),
  property:properties(id, address_line1, city, state),
  service:services(id, name),
  crew_lead:employees(id, first_name, last_name)
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
  crew: { id: string; first_name: string; last_name: string }[];
  time_entries: TimeEntry[];
  equipment: JobEquipment[];
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
        supabase.from("job_employees").select("employee:employees(id, first_name, last_name)").eq("job_id", id),
        supabase.from("time_entries").select("*").eq("job_id", id),
        supabase.from("job_equipment").select("*").eq("job_id", id),
        supabase.from("job_materials").select("*").eq("job_id", id),
        supabase.from("job_photos").select("*").eq("job_id", id),
      ]);

    const crew = (jobEmployees ?? [])
      .map((je) => (je as unknown as { employee: { id: string; first_name: string; last_name: string } | null }).employee)
      .filter((e): e is { id: string; first_name: string; last_name: string } => e !== null);

    return {
      ...(job as unknown as JobWithRelations),
      crew,
      time_entries: timeEntries ?? [],
      equipment: equipment ?? [],
      materials: materials ?? [],
      photos: photos ?? [],
    };
  });
}

/** Production rate = job revenue / actual production hours, computed per job. */
export function jobProductionRate(job: Pick<Job, "price" | "actual_hours">): number | null {
  if (!job.actual_hours || job.actual_hours <= 0) return null;
  return job.price / job.actual_hours;
}
