/**
 * Not a "use server" file — just a plain shared constant. lib/actions/jobs.ts
 * has "use server" at the top, which requires every export from that module
 * to be an async function, so a plain array constant has to live here
 * instead (both the form actions and the Jarvis write tools/executor import
 * it from this one place).
 */
export const VALID_JOB_STATUSES = ["scheduled", "in_progress", "completed", "cancelled", "skipped"] as const;
