import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { hoursForTimeEntry } from "@/lib/calculations";
import type { DataResult, Employee, EmployeeWithStats } from "@/types/domain";

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
      .select("employee_id, regular_hours, clock_in, clock_out, work_date")
      .in("employee_id", employeeIds)
      .gte("work_date", weekStart);

    const { data: jobEmployees } = await supabase
      .from("job_employees")
      .select("employee_id, job:jobs(id, scheduled_date)")
      .in("employee_id", employeeIds);

    const hoursByEmployee = new Map<string, number>();
    for (const entry of timeEntries ?? []) {
      hoursByEmployee.set(entry.employee_id, (hoursByEmployee.get(entry.employee_id) ?? 0) + hoursForTimeEntry(entry));
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

export type EmployeeJobRow = {
  id: string;
  scheduled_date: string | null;
  status: string;
  hours_worked: number | null;
  service: { name: string } | null;
};

export async function getEmployeeRecentJobs(employeeId: string): Promise<DataResult<EmployeeJobRow[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("job_employees")
      .select("hours_worked, job:jobs(id, scheduled_date, status, service:services(name))")
      .eq("employee_id", employeeId);
    if (error) throw error;

    const rows = (data ?? [])
      .map((row) => {
        const je = row as unknown as {
          hours_worked: number | null;
          job: { id: string; scheduled_date: string | null; status: string; service: { name: string } | null } | null;
        };
        if (!je.job) return null;
        return {
          id: je.job.id,
          scheduled_date: je.job.scheduled_date,
          status: je.job.status,
          hours_worked: je.hours_worked,
          service: je.job.service,
        };
      })
      .filter((row): row is EmployeeJobRow => row !== null);

    rows.sort((a, b) => (b.scheduled_date ?? "").localeCompare(a.scheduled_date ?? ""));
    return rows.slice(0, 15);
  });
}
