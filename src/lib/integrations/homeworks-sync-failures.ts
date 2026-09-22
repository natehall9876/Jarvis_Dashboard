import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";

export type SyncFailureOrigin = "webhook" | "bulk_import";
export type SyncFailureReason = "invalid_secret" | "invalid_payload" | "processing_failed";

/**
 * Fixed, pre-written messages for the two rejection reasons that happen
 * BEFORE any Homeworks record is even parsed. Using constants (rather than
 * building a message from the request) is itself the redaction guarantee —
 * there is no code path that can accidentally interpolate the caller-
 * provided (wrong) secret, a raw request header, or any other untrusted
 * input into these two. Unit-tested in e2e/homeworks-sync-failures.spec.ts
 * to lock this in, not just documented.
 */
export const INVALID_SECRET_MESSAGE = "The provided webhook secret did not match the configured HOMEWORKS_WEBHOOK_SECRET.";
export const INVALID_PAYLOAD_MESSAGE = "Body must include entity_type ('customer'|'property'|'invoice'|'job'), homeworks_id, and the required parent id for property/invoice/job.";

/**
 * A failed delivery has no Jarvis business record to attach an activity_log
 * entry to (see homeworks-sync-failures-migration.sql's doc comment for why
 * that table's required entity_id uuid doesn't fit this). Written through
 * the caller's already-constructed service-role client — same reasoning as
 * activity-log.ts's optional client parameter: neither the webhook nor the
 * bulk-import route has a Supabase Auth session for RLS to authorize
 * against. Never throws: a missing migration or a transient DB error must
 * never turn "log this failure" into a second failure that masks the real
 * HTTP error response the caller (Zapier, or the owner's import tool) is
 * about to receive.
 */
export async function logSyncFailure(
  supabase: SupabaseClient<Database>,
  failure: {
    origin: SyncFailureOrigin;
    reason: SyncFailureReason;
    entityType?: string;
    homeworksId?: string;
    errorMessage: string;
    detail?: Json;
  },
): Promise<void> {
  try {
    await supabase.from("homeworks_sync_failures").insert({
      origin: failure.origin,
      reason: failure.reason,
      entity_type: failure.entityType ?? null,
      homeworks_id: failure.homeworksId ?? null,
      error_message: failure.errorMessage,
      detail: failure.detail ?? null,
    });
  } catch {
    // Table not migrated yet, or a transient error — the caller's real
    // response to Zapier/the importer must not depend on this succeeding.
  }
}

export type RecentSyncFailure = {
  id: string;
  createdAt: string;
  origin: SyncFailureOrigin;
  reason: SyncFailureReason;
  entityType: string | null;
  homeworksId: string | null;
  errorMessage: string;
};

/** Best-effort read for the Settings sync-status panel — returns [] rather than throwing if the table doesn't exist yet or the query fails. */
export async function getRecentSyncFailures(supabase: SupabaseClient<Database>, limit = 10): Promise<RecentSyncFailure[]> {
  try {
    const { data, error } = await supabase
      .from("homeworks_sync_failures")
      .select("id, created_at, origin, reason, entity_type, homeworks_id, error_message")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      origin: r.origin as SyncFailureOrigin,
      reason: r.reason as SyncFailureReason,
      entityType: r.entity_type,
      homeworksId: r.homeworks_id,
      errorMessage: r.error_message,
    }));
  } catch {
    return [];
  }
}
