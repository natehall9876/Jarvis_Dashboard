import { isISODate } from "@/lib/integrations/homeworks-dates";
import { VALID_JOB_STATUSES } from "@/lib/actions/job-constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** Legacy payload helpers remain available for read-only inspection. */
export const LEGACY_HOMEWORKS_WRITE_DISABLED =
  "Manual Homeworks imports, webhooks, linking, and enrichment are retired. Automatic Homeworks sync is authoritative; make source changes in Homeworks.";

export type CustomerPayload = {
  entity_type: "customer";
  homeworks_id: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
};

export type PropertyPayload = {
  entity_type: "property";
  homeworks_id: string;
  customer_homeworks_id: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  property_name?: string;
};

export type InvoicePayload = {
  entity_type: "invoice";
  homeworks_id: string;
  customer_homeworks_id: string;
  invoice_number?: string;
  total?: number;
  amount_paid?: number;
  status?: string;
  due_date?: string;
  invoice_date?: string;
};

export type JobPayload = {
  entity_type: "job";
  homeworks_id: string;
  property_homeworks_id: string;
  /** ISO YYYY-MM-DD. */
  scheduled_date?: string;
  /**
   * Only set when Homeworks' own `hasTime` was true for this event —
   * never invented. An all-day event (hasTime: false) must sync with
   * scheduled_start_time explicitly null; omitted time preserves an existing value.
   */
  scheduled_start_time?: string | null;
  /** The real quoted/invoiced total from Homeworks (Event.total), not an estimate. */
  price?: number;
  /** Already mapped by the caller to a valid Jarvis job status — this function doesn't interpret Homeworks' own EventStatus. */
  status?: string;
  notes?: string;
};

export type HomeworksSyncPayload = CustomerPayload | PropertyPayload | InvoicePayload | JobPayload;

export type HomeworksSyncResult = { ok: true; entity_type: string; id: string } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidHomeworksSyncPayload(value: unknown): value is HomeworksSyncPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.entity_type) || !isNonEmptyString(v.homeworks_id)) return false;
  if (!["customer", "property", "invoice", "job"].includes(v.entity_type)) return false;
  if (v.entity_type === "job" && !isNonEmptyString(v.property_homeworks_id)) return false;
  if ((v.entity_type === "property" || v.entity_type === "invoice") && !isNonEmptyString(v.customer_homeworks_id)) return false;
  const strings = ["first_name", "last_name", "company_name", "email", "phone", "street", "city", "state", "zip", "property_name", "invoice_number", "notes"];
  if (strings.some(key => v[key] != null && typeof v[key] !== "string")) return false;
  for (const key of ["total", "amount_paid", "price"]) {
    if (v[key] != null && (typeof v[key] !== "number" || !Number.isFinite(v[key]) || (v[key] as number) < 0)) return false;
  }
  for (const key of ["scheduled_date", "due_date", "invoice_date"]) {
    if (v[key] != null && v[key] !== "" && (typeof v[key] !== "string" || !isISODate(v[key] as string))) return false;
  }
  if (v.scheduled_start_time != null && (typeof v.scheduled_start_time !== "string" || !/^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v.scheduled_start_time))) return false;
  if (v.status != null && v.status !== "") {
    const statuses: readonly string[] = v.entity_type === "job" ? VALID_JOB_STATUSES : ["draft", "sent", "paid", "void"];
    if (typeof v.status !== "string" || !statuses.includes(v.status)) return false;
  }
  return true;
}

/** Drops undefined/null/blank values so they are omitted from an upsert instead of overwriting existing data with null. */
export function presentFields<T extends Record<string, string | null | undefined>>(fields: T): Partial<Record<keyof T, string>> {
  const out: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const v = fields[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v;
  }
  return out;
}

/**
 * Retired sink, retained so a stale server caller cannot revive a competing
 * projection writer. Automatic sync and verified schedule writes use
 * homeworks_apply_page directly and never call this function.
 */
export async function syncHomeworksEntity(
  _supabase: SupabaseClient<Database>,
  _payload: HomeworksSyncPayload,
  _origin: "webhook" | "bulk_import" = "bulk_import",
): Promise<HomeworksSyncResult> {
  void _origin; // Retain the legacy signature without accessing the client or payload.
  return { ok: false, error: LEGACY_HOMEWORKS_WRITE_DISABLED };
}
