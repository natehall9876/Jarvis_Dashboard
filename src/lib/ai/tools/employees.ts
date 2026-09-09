import { getEmployees, getEmployeeById, getEmployeeRecentJobs } from "@/lib/data/employees";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const employeeTools: ToolSpec[] = [
  {
    name: "get_employees",
    description:
      "List all employees/crew with role, hourly rate, active status, and this week's hours worked / labor cost / jobs worked — use for 'who's working' and productivity-comparison questions.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getEmployees();
      return unwrap(result, (employees) => ({
        data: employees.map((e) => ({
          id: e.id,
          name: [e.first_name, e.last_name].filter(Boolean).join(" "),
          role: e.role,
          active: e.active,
          hourly_rate: e.hourly_rate,
          hours_this_week: e.hours_this_week,
          labor_cost_this_week: e.labor_cost_this_week,
          jobs_worked_this_week: e.jobs_worked_this_week,
        })),
        references: employees.map((e) => ({ type: "employee" as const, id: e.id, label: [e.first_name, e.last_name].filter(Boolean).join(" ") })),
      }));
    },
  },
  {
    name: "get_employee_details",
    description: "One employee's contact info, role, rate, and their 15 most recent job assignments with hours worked on each.",
    input_schema: {
      type: "object",
      properties: { employee_id: { type: "string", description: "The employee's UUID." } },
      required: ["employee_id"],
    },
    execute: async (input) => {
      const id = String(input.employee_id);
      const [employeeResult, jobsResult] = await Promise.all([getEmployeeById(id), getEmployeeRecentJobs(id)]);
      if (employeeResult.error !== null) return { data: { error: employeeResult.error } };
      const employee = employeeResult.data;
      const jobs = jobsResult.data ?? [];
      return {
        data: {
          id: employee.id,
          name: [employee.first_name, employee.last_name].filter(Boolean).join(" "),
          role: employee.role,
          active: employee.active,
          hourly_rate: employee.hourly_rate,
          hire_date: employee.hire_date,
          has_drivers_license: employee.has_drivers_license,
          notes: employee.notes,
          recent_jobs: jobs.map((j) => ({
            id: j.id,
            scheduled_date: j.scheduled_date,
            status: j.status,
            hours_worked: j.hours_worked,
            service: j.service?.name ?? null,
          })),
        },
        references: [
          { type: "employee" as const, id: employee.id, label: [employee.first_name, employee.last_name].filter(Boolean).join(" ") },
          ...jobs.map((j) => ({ type: "job" as const, id: j.id, label: j.scheduled_date ?? "unscheduled" })),
        ],
      };
    },
  },
];
