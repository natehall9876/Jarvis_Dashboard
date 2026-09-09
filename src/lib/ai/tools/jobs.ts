import { getJobs, getJobById, getWorkloadSummary } from "@/lib/data/jobs";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";
import type { JobStatus } from "@/types/domain";

const JOB_STATUSES: JobStatus[] = ["scheduled", "in_progress", "completed", "cancelled", "skipped"];

export const jobTools: ToolSpec[] = [
  {
    name: "get_jobs",
    description:
      "List jobs, optionally filtered by a date range (scheduled_date, inclusive) and/or status. For a single day, pass the same date as both from and to. Returns each job's client, property, service, price, budgeted/actual hours, and status — enough to answer most 'what jobs do we have' questions directly. For a full day/week/range roll-up with totals, prefer get_workload_summary instead.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, ISO YYYY-MM-DD, inclusive." },
        to: { type: "string", description: "End date, ISO YYYY-MM-DD, inclusive." },
        status: { type: "string", enum: JOB_STATUSES, description: "Optional status filter." },
        route_id: { type: "string", description: "Optional: restrict to jobs on one route." },
      },
    },
    execute: async (input) => {
      const result = await getJobs({
        from: typeof input.from === "string" ? input.from : undefined,
        to: typeof input.to === "string" ? input.to : undefined,
        status: typeof input.status === "string" ? (input.status as JobStatus) : undefined,
        routeId: typeof input.route_id === "string" ? input.route_id : undefined,
      });
      return unwrap(result, (jobs) => ({
        data: jobs.map((j) => ({
          id: j.id,
          scheduled_date: j.scheduled_date,
          scheduled_start_time: j.scheduled_start_time,
          client: clientDisplayName(j.property?.client),
          property: propertyAddress(j.property),
          service: j.service?.name ?? null,
          status: j.status,
          price: j.price,
          budgeted_hours: j.budgeted_hours,
          actual_hours: j.actual_hours,
          crew_size: j.crew_size,
        })),
        references: jobs.map((j) => ({
          type: "job" as const,
          id: j.id,
          label: `${clientDisplayName(j.property?.client)} — ${j.scheduled_date ?? "unscheduled"}`,
        })),
      }));
    },
  },
  {
    name: "get_workload_summary",
    description:
      "Deterministic day-by-day workload roll-up for a date range: job count, total expected revenue, total budgeted labor hours, and unique crew assigned per day, plus range totals. This is the right tool for 'how does Friday look', 'is this week overloaded', or any question about crew/revenue load over a span of days — the totals are pre-computed, not something to sum yourself.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, ISO YYYY-MM-DD, inclusive." },
        to: { type: "string", description: "End date, ISO YYYY-MM-DD, inclusive." },
      },
      required: ["from", "to"],
    },
    execute: async (input) => {
      const result = await getWorkloadSummary(String(input.from), String(input.to));
      return unwrap(result, (summary) => ({
        data: summary,
        references: summary.days.flatMap((d) => d.jobs.map((j) => ({ type: "job" as const, id: j.id, label: `${j.client} — ${d.date}` }))),
      }));
    },
  },
  {
    name: "get_job_details",
    description:
      "Full detail for one job: client, property, service, schedule, price, budgeted vs actual hours, assigned crew with hours worked, equipment used, and materials logged.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job's UUID." },
      },
      required: ["job_id"],
    },
    execute: async (input) => {
      const result = await getJobById(String(input.job_id));
      return unwrap(result, (job) => ({
        data: {
          id: job.id,
          client: clientDisplayName(job.property?.client),
          property: propertyAddress(job.property),
          service: job.service?.name ?? null,
          status: job.status,
          scheduled_date: job.scheduled_date,
          scheduled_start_time: job.scheduled_start_time,
          started_at: job.started_at,
          completed_at: job.completed_at,
          price: job.price,
          budgeted_hours: job.budgeted_hours,
          actual_hours: job.actual_hours,
          crew_size: job.crew_size,
          notes: job.notes,
          completion_notes: job.completion_notes,
          crew: job.crew.map((c) => ({ name: [c.first_name, c.last_name].filter(Boolean).join(" "), hours_worked: c.hours_worked })),
          equipment_used: job.equipment.map((e) => ({ name: e.equipment?.name ?? "Unknown", hours_used: e.hours_used })),
          materials: job.materials.map((m) => ({ name: m.material_name, quantity: m.quantity, unit: m.unit })),
        },
        references: [
          { type: "job" as const, id: job.id, label: `${clientDisplayName(job.property?.client)} — ${job.scheduled_date ?? "unscheduled"}` },
          ...(job.property?.client ? [{ type: "client" as const, id: job.property.client.id, label: clientDisplayName(job.property.client) }] : []),
          ...(job.property ? [{ type: "property" as const, id: job.property.id, label: propertyAddress(job.property) }] : []),
          ...job.crew.map((c) => ({ type: "employee" as const, id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") })),
        ],
      }));
    },
  },
];
