import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Employee, EmployeeWithStats } from "@/types/domain";

function startOfWeek(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Prefers the stored regular_hours figure; falls back to clock_in/clock_out difference. */
function hoursForEntry(entry: { regular_hours: number | null; clock_in: string | null; clock_out: string | null }): number {
  if (entry.regular_hours !== null) return entry.regular_hours;
  if (entry.clock_in && entry.clock_out) {
    return (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3_600_000;
  }
  return 0;
}

export async function getEmployees(): Promise<DataResult<EmployeeWithStats[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: employees, error } = await supabase
      .from("employees")
      .select("*")
      .order("first_name");
    if (error) throw error;
    if (!employees || employees.length === 0) return [];

    const weekStart = startOfWeek();
    const employeeIds = employees.map((e) => e.id);

    const { data: timeEntries } = await supabase
      .from("time_entries")
      .select("employee_id, regular_hours, clock_in, clock_out, work_date")
      .in("employee_id", employeeIds)
      .gte("work_date", weekStart);

    const { data: jobEmployees } = await supabase
      .from("job_employees")
      .select("employee_id, job:jobs(id, scheduled_date)")
      .in("employee_id", employeeIds);

    const hoursByEmployee = new Map<string, number>();
    for (const entry of timeEntries ?? []) {
      hoursByEmployee.set(entry.employee_id, (hoursByEmployee.get(entry.employee_id) ?? 0) + hoursForEntry(entry));
    }

    const jobsThisWeekByEmployee = new Map<string, number>();
    for (const je of jobEmployees ?? []) {
      const job = (je as unknown as { job: { id: string; scheduled_date: string | null } | null }).job;
      if (!job?.scheduled_date || job.scheduled_date < weekStart) continue;
      jobsThisWeekByEmployee.set(je.employee_id, (jobsThisWeekByEmployee.get(je.employee_id) ?? 0) + 1);
    }

    return employees.map((employee): EmployeeWithStats => {
      const hoursThisWeek = hoursByEmployee.get(employee.id) ?? 0;
      return {
        ...employee,
        hours_this_week: hoursThisWeek,
        labor_cost_this_week: hoursThisWeek * (employee.hourly_rate ?? 0),
        jobs_worked_this_week: jobsThisWeekByEmployee.get(employee.id) ?? 0,
      };
    });
  });
}

export async function getEmployeeById(id: string): Promise<DataResult<Employee>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("employees").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  });
}
