import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DataResult } from "@/types/domain";
import type { ActivitySource, Database, Json } from "@/types/database.types";

export type ActivityEntityType = "job" | "client" | "property" | "invoice" | "quote" | "equipment";

export type ActivityEvent = {
  id: string;
  createdAt: string;
  entityType: ActivityEntityType;
  entityId: string;
  eventType: string;
  summary: string;
  detail: Json | null;
  source: ActivitySource;
};

/**
 * Best-effort, append-only activity logging — the queryable answer to "what
 * happened at this property?" that a record's own current-state columns
 * can't give you (they only show what's true NOW, not the history of how it
 * got there). Deliberately swallows its own errors and never throws: this
 * table doesn't exist until supabase/activity-log-migration.sql is run, and
 * a missing audit trail should never be the reason a real business action
 * fails. Call sites that also want a human-visible trail today (e.g. a
 * job's own notes field) keep doing that separately — this is additive, not
 * a replacement for whatever already works.
 */
export async function logActivity(
  event: {
    entityType: ActivityEntityType;
    entityId: string;
    eventType: string;
    summary: string;
    detail?: Json;
    source: ActivitySource;
  },
  /**
   * Callers with an authenticated Supabase Auth session (Server Actions,
   * Route Handlers reached through the browser) can omit this — a normal
   * cookie-based client is created and RLS's `to authenticated` policy
   * covers it. A server-to-server caller with NO session (the Homeworks
   * webhook, which authenticates via a shared secret instead) has nothing
   * for that RLS policy to authorize, so it must pass its own already-
   * constructed admin client instead — same pattern as every other
   * documented service-role use in this project (lib/supabase/admin.ts).
   */
  client?: SupabaseClient<Database>,
): Promise<void> {
  try {
    const supabase = client ?? (await createSupabaseServerClient());
    await supabase.from("activity_log").insert({
      entity_type: event.entityType,
      entity_id: event.entityId,
      event_type: event.eventType,
      summary: event.summary,
      detail: event.detail ?? null,
      source: event.source,
    });
  } catch {
    // Table not migrated yet, or a transient error — never block the real
    // action (or a page render) over the audit trail.
  }
}

export async function getActivityForEntity(
  entityType: ActivityEntityType,
  entityId: string,
  limit = 25,
): Promise<DataResult<ActivityEvent[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      // Most likely "relation does not exist" because the migration hasn't
      // been run yet — treat as "no history available" rather than a hard
      // error, so the page renders a normal empty state instead of an
      // error banner for something that isn't the owner's fault.
      return { data: [], error: null };
    }

    return {
      data: (data ?? []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        entityType: row.entity_type as ActivityEntityType,
        entityId: row.entity_id,
        eventType: row.event_type,
        summary: row.summary,
        detail: row.detail,
        source: row.source as ActivitySource,
      })),
      error: null,
    };
  } catch {
    return { data: [], error: null };
  }
}
