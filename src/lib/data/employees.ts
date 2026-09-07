import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Employee, EmployeeWithStats, Job } from "@/types/domain";

function startOfWeek(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
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
      .select("employee_id, clock_in, clock_out")
      .in("employee_id", employeeIds)
      .gte("clock_in", weekStart);

    const { data: jobEmployees } = await supabase
      .from("job_employees")
      .select("employee_id, job:jobs(id, scheduled_date, price)")
      .in("employee_id", employeeIds);

    const hoursByEmployee = new Map<string, number>();
    for (const entry of timeEntries ?? []) {
      if (!entry.clock_out) continue;
      const hours =
        (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3_600_000;
      hoursByEmployee.set(entry.employee_id, (hoursByEmployee.get(entry.employee_id) ?? 0) + hours);
    }

    const jobsThisWeekByEmployee = new Map<string, number>();
    for (const je of jobEmployees ?? []) {
      const job = (je as unknown as { job: Pick<Job, "id" | "scheduled_date" | "price"> | null }).job;
      if (!job || job.scheduled_date < weekStart) continue;
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
