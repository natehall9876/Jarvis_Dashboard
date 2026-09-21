import { randomUUID } from "crypto";
import { getJobById } from "@/lib/data/jobs";
import { getJobNotes, getOpenTasks } from "@/lib/data/notes-tasks";
import { clientDisplayName } from "@/lib/format";
import { validateNote, validateTask } from "@/lib/jarvis/notes-tasks-validation";
import type { ProposedAction } from "@/lib/ai/action-types";
import type { ToolSpec } from "@/lib/ai/tool-types";

/**
 * Read tools and proposal tools for job notes and owner tasks. The propose_*
 * tools never write: each returns a ProposedAction the owner must confirm with a
 * tap (a spoken transcript is never a confirmation), and the executor re-validates
 * every field. Same rules a typed form is held to (lib/jarvis/notes-tasks-validation).
 */
function action(input: Omit<ProposedAction, "kind" | "id" | "requiresConfirmation" | "createdAt" | "warnings"> & { warnings?: string[] }): { data: ProposedAction } {
  return { data: { kind: "proposed_action", id: randomUUID(), requiresConfirmation: true, createdAt: new Date().toISOString(), warnings: [], ...input } };
}

export const taskTools: ToolSpec[] = [
  {
    name: "get_open_tasks",
    description: "List the owner's open tasks/reminders (title, due date, linked job). Use for 'what's on my task list', 'what do I need to bring', 'what reminders do I have'.",
    input_schema: { type: "object", properties: {}, required: [] },
    execute: async () => {
      const result = await getOpenTasks();
      if (result.needsMigration) return { data: { tasks: [], note: "Tasks are not set up yet — the tasks migration hasn't been run, so no tasks can exist." } };
      if (result.error) return { data: { error: result.error } };
      return { data: { tasks: result.data.map((t) => ({ id: t.id, title: t.title, due_date: t.dueDate, notes: t.notes, job_id: t.jobId })), count: result.data.length } };
    },
  },
  {
    name: "get_job_notes",
    description: "List the dated notes recorded on ONE specific job (newest first). Requires the job_id.",
    input_schema: { type: "object", properties: { job_id: { type: "string", description: "The exact job UUID." } }, required: ["job_id"] },
    execute: async (input) => {
      const result = await getJobNotes(String(input.job_id));
      if (result.needsMigration) return { data: { notes: [], note: "Job notes are not set up yet — the notes migration hasn't been run." } };
      if (result.error) return { data: { error: result.error } };
      return { data: { notes: result.data.map((n) => ({ id: n.id, created_at: n.createdAt, body: n.body, source: n.source })) } };
    },
  },
  {
    name: "propose_add_job_note",
    description:
      "Prepare a proposed NOTE on ONE specific job — this does NOT save it. The owner must confirm the card first. Use for 'add a note to this job: …'. When the owner is viewing a job, use that job's id from the page context; if it is ambiguous which job they mean, ask. Put the owner's words in `note` cleanly, without inventing details.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The exact job UUID." },
        note: { type: "string", description: "The note text, at most 2000 characters." },
      },
      required: ["job_id", "note"],
    },
    execute: async (input) => {
      const note = validateNote(input.note);
      if (!note.ok) return { data: { error: note.message } };
      const jobId = String(input.job_id);
      const result = await getJobById(jobId);
      if (result.error !== null || !result.data) return { data: { error: result.error ?? "Job not found." } };
      const job = result.data;
      const label = `${clientDisplayName(job.property?.client)}${job.service?.name ? ` — ${job.service.name}` : ""}`;
      return action({
        type: "add_job_note",
        title: `Add a note to ${label}`,
        target: { type: "job", id: jobId },
        current: null,
        proposed: { note: note.value },
        explanation: "Requested by owner.",
        payload: { job_id: jobId, note: note.value },
        snapshot: null,
      });
    },
  },
  {
    name: "propose_create_task",
    description:
      "Prepare a proposed TASK/REMINDER for the owner — this does NOT save it. The owner must confirm first. Use for 'remind me to bring the dethatcher'. due_date is optional ISO YYYY-MM-DD — only set it if the owner gave or clearly implied a date; never invent one. Optionally link a job_id when the task is about one specific job.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title, at most 300 characters." },
        due_date: { type: "string", description: "Optional ISO YYYY-MM-DD." },
        notes: { type: "string", description: "Optional extra detail." },
        job_id: { type: "string", description: "Optional exact job UUID this task relates to." },
      },
      required: ["title"],
    },
    execute: async (input) => {
      const t = validateTask({ title: input.title, notes: input.notes, dueDate: input.due_date });
      if (!t.ok) return { data: { error: t.message } };
      const jobId = typeof input.job_id === "string" && input.job_id ? input.job_id : null;
      return action({
        type: "create_task",
        title: `Add task: ${t.value.title}`,
        target: jobId ? { type: "job", id: jobId } : null,
        current: null,
        proposed: { task: t.value.title, due: t.value.dueDate ?? "no due date", ...(t.value.notes ? { notes: t.value.notes } : {}) },
        explanation: "Requested by owner.",
        payload: { title: t.value.title, notes: t.value.notes, due_date: t.value.dueDate, job_id: jobId },
        snapshot: null,
      });
    },
  },
  {
    name: "propose_complete_task",
    description: "Prepare a proposed completion of ONE open task — this does NOT change it. The owner must confirm first. Get the task_id from get_open_tasks; if more than one task could match, ask which.",
    input_schema: { type: "object", properties: { task_id: { type: "string", description: "The exact task UUID." } }, required: ["task_id"] },
    execute: async (input) => {
      const tasks = await getOpenTasks();
      const task = tasks.data.find((t) => t.id === String(input.task_id));
      if (!task) return { data: { error: "That task wasn't found among the open tasks." } };
      return action({
        type: "complete_task",
        title: `Mark done: ${task.title}`,
        target: null,
        current: { status: "open" },
        proposed: { status: "done" },
        explanation: "Requested by owner.",
        payload: { task_id: task.id },
        snapshot: null,
      });
    },
  },
];
