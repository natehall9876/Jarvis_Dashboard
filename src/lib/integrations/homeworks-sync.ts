import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { extractErrorMessage } from "@/lib/data/shared";
import { logActivity, type ActivityEntityType } from "@/lib/data/activity-log";

/**
 * Shared upsert logic for one Homeworks record, used by both the live
 * webhook (src/app/api/integrations/homeworks/webhook/route.ts — one record
 * per Zapier-triggered event) and the bulk backfill endpoint
 * (src/app/api/integrations/homeworks/import/route.ts — many records at
 * once, for importing the existing customer base). Keeping this in one
 * place means a fix here (like the ON CONFLICT bug found via the first
 * live test) never has to be made twice.
 */

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
   * scheduled_start_time left unset, not defaulted to a guessed time.
   */
  scheduled_start_time?: string;
  /** The real quoted/invoiced total from Homeworks (Event.total), not an estimate. */
  price?: number;
  /** Already mapped by the caller to a valid Jarvis job status — this function doesn't interpret Homeworks' own EventStatus. */
  status?: string;
  notes?: string;
};

export type HomeworksSyncPayload = CustomerPayload | PropertyPayload | InvoicePayload | JobPayload;

/**
 * Jobs were never part of the bulk-CSV/JSON import + dry-run feature
 * (admin-import UI, ../import/route.ts) — that path only ever constructs
 * customer/property/invoice payloads. dryRunHomeworksEntity below is
 * scoped to this narrower type rather than the full HomeworksSyncPayload
 * union so adding JobPayload above doesn't force it to handle a job case
 * it was never designed for.
 */
export type BulkImportPayload = CustomerPayload | PropertyPayload | InvoicePayload;

export type HomeworksSyncResult = { ok: true; entity_type: string; id: string } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidHomeworksSyncPayload(value: unknown): value is HomeworksSyncPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.entity_type) || !isNonEmptyString(v.homeworks_id)) return false;
  if (v.entity_type === "job") return isNonEmptyString(v.property_homeworks_id);
  if (v.entity_type === "property" || v.entity_type === "invoice") {
    return isNonEmptyString(v.customer_homeworks_id);
  }
  return v.entity_type === "customer";
}

export type HomeworksDryRunResult =
  | { homeworks_id: string; entity_type: string; action: "create" | "update" }
  | { homeworks_id: string; entity_type: string; action: "would_fail"; error: string };

/**
 * Read-only preview of what syncHomeworksEntity would do — no insert,
 * update, or upsert call, ever. Used by the bulk import endpoint's
 * `dry_run: true` mode so a real Homeworks export can be checked (would
 * this create N new clients or update M existing ones? does every
 * property/invoice reference a customer that's actually in the batch or
 * already synced?) before a single row is written.
 */
export async function dryRunHomeworksEntity(
  supabase: SupabaseClient<Database>,
  payload: BulkImportPayload,
  /**
   * customer_homeworks_id values already checked as "create" earlier in
   * this same dry-run batch — a real import processes sequentially, so a
   * property listed after its customer in the same file would succeed
   * even though the customer isn't in the database yet at dry-run time.
   * Without this, the dry-run would incorrectly flag that as a failure.
   */
  customersSeenInBatch: ReadonlySet<string>,
): Promise<HomeworksDryRunResult> {
  const table = payload.entity_type === "customer" ? "clients" : payload.entity_type === "property" ? "properties" : "invoices";

  if (payload.entity_type !== "customer" && !customersSeenInBatch.has(payload.customer_homeworks_id)) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("homeworks_id", payload.customer_homeworks_id)
      .maybeSingle();
    if (clientError) {
      return { homeworks_id: payload.homeworks_id, entity_type: payload.entity_type, action: "would_fail", error: extractErrorMessage(clientError) };
    }
    if (!client) {
      return {
        homeworks_id: payload.homeworks_id,
        entity_type: payload.entity_type,
        action: "would_fail",
        error: `No client with homeworks_id "${payload.customer_homeworks_id}" found already synced or earlier in this same batch — reorder so the customer comes first.`,
      };
    }
  }

  const { data: existing, error } = await supabase.from(table).select("id").eq("homeworks_id", payload.homeworks_id).maybeSingle();
  if (error) {
    return { homeworks_id: payload.homeworks_id, entity_type: payload.entity_type, action: "would_fail", error: extractErrorMessage(error) };
  }
  return { homeworks_id: payload.homeworks_id, entity_type: payload.entity_type, action: existing ? "update" : "create" };
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

const ENTITY_TYPE_MAP: Record<HomeworksSyncPayload["entity_type"], ActivityEntityType> = {
  customer: "client",
  property: "property",
  invoice: "invoice",
  job: "job",
};

/**
 * The only place a webhook-delivered (or bulk-imported) sync becomes
 * visible as anything other than a raw row count — see the doc comment on
 * HomeworksSyncStatus.lastWebhookDeliveryAt for why a count alone was found
 * not to be evidence of current delivery. Logs through the SAME client the
 * caller already used for the upsert (an admin/service-role client in both
 * the live-webhook and bulk-import routes, since neither has a Supabase
 * Auth session for RLS to authorize against) rather than logActivity's
 * default authenticated-session client, which would silently fail here.
 */
async function logSync(
  supabase: SupabaseClient<Database>,
  payload: HomeworksSyncPayload,
  id: string,
  origin: "webhook" | "bulk_import",
): Promise<void> {
  await logActivity(
    {
      entityType: ENTITY_TYPE_MAP[payload.entity_type],
      entityId: id,
      eventType: origin === "webhook" ? "homeworks_webhook_sync" : "homeworks_bulk_import",
      summary:
        origin === "webhook"
          ? `${payload.entity_type} synced from a live Homeworks webhook (Zapier)`
          : `${payload.entity_type} synced via bulk import`,
      detail: { homeworks_id: payload.homeworks_id, entity_type: payload.entity_type },
      source: "system",
    },
    supabase,
  );
}

export async function syncHomeworksEntity(
  supabase: SupabaseClient<Database>,
  payload: HomeworksSyncPayload,
  origin: "webhook" | "bulk_import" = "webhook",
): Promise<HomeworksSyncResult> {
  try {
    switch (payload.entity_type) {
      case "customer": {
        const { data, error } = await supabase
          .from("clients")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              // Only fields Homeworks actually supplied are included: an
              // omitted column is left untouched by the upsert on an
              // existing row, so a blank Homeworks value can never wipe a
              // real Jarvis value.
              ...presentFields({
                first_name: payload.first_name,
                last_name: payload.last_name,
                company_name: payload.company_name,
                email: payload.email,
                phone: payload.phone,
              }),
              // Arrived through a real Homeworks sync path (Zapier webhook,
              // admin import, or the direct API) — genuinely sourced, never
              // 'demo'. Doesn't overwrite an existing row's data_source with
              // anything other than this same value on repeat syncs.
              data_source: "homeworks_sync",
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        await logSync(supabase, payload, data.id, origin);
        return { ok: true, entity_type: "customer", id: data.id };
      }
      case "property": {
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("homeworks_id", payload.customer_homeworks_id)
          .maybeSingle();
        if (clientError) throw clientError;
        if (!client) {
          return { ok: false, error: `No client found with homeworks_id "${payload.customer_homeworks_id}" — sync the customer first.` };
        }
        const { data, error } = await supabase
          .from("properties")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              client_id: client.id,
              ...presentFields({
                street: payload.street,
                city: payload.city,
                state: payload.state,
                zip: payload.zip,
                property_name: payload.property_name,
              }),
              active: true,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        await logSync(supabase, payload, data.id, origin);
        return { ok: true, entity_type: "property", id: data.id };
      }
      case "invoice": {
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("homeworks_id", payload.customer_homeworks_id)
          .maybeSingle();
        if (clientError) throw clientError;
        if (!client) {
          return { ok: false, error: `No client found with homeworks_id "${payload.customer_homeworks_id}" — sync the customer first.` };
        }
        const total = typeof payload.total === "number" ? payload.total : 0;
        const { data, error } = await supabase
          .from("invoices")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              client_id: client.id,
              invoice_number: payload.invoice_number ?? null,
              total,
              subtotal: total,
              tax: 0,
              amount_paid: typeof payload.amount_paid === "number" ? payload.amount_paid : 0,
              status: payload.status ?? "sent",
              due_date: payload.due_date ?? null,
              invoice_date: payload.invoice_date ?? null,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        await logSync(supabase, payload, data.id, origin);
        return { ok: true, entity_type: "invoice", id: data.id };
      }
      case "job": {
        const { data: property, error: propertyError } = await supabase
          .from("properties")
          .select("id")
          .eq("homeworks_id", payload.property_homeworks_id)
          .maybeSingle();
        if (propertyError) throw propertyError;
        if (!property) {
          return { ok: false, error: `No property found with homeworks_id "${payload.property_homeworks_id}" — sync the customer/property first.` };
        }
        const { data, error } = await supabase
          .from("jobs")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              property_id: property.id,
              scheduled_date: payload.scheduled_date ?? null,
              // Deliberately null, never defaulted, when Homeworks didn't
              // report a specific time (hasTime: false) — an all-day event
              // has no real start time to invent.
              scheduled_start_time: payload.scheduled_start_time ?? null,
              price: typeof payload.price === "number" ? payload.price : null,
              status: payload.status ?? "scheduled",
              // Omitted (not nulled) when absent, so re-syncing never wipes
              // notes the owner added in Jarvis.
              ...presentFields({ notes: payload.notes }),
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        await logSync(supabase, payload, data.id, origin);
        return { ok: true, entity_type: "job", id: data.id };
      }
    }
  } catch (err) {
    const message = extractErrorMessage(err);
    console.error("[homeworks-sync]", message, err);
    return { ok: false, error: message };
  }
}
