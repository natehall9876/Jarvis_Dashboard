import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { extractErrorMessage } from "@/lib/data/shared";

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

export type HomeworksSyncPayload = CustomerPayload | PropertyPayload | InvoicePayload;

export type HomeworksSyncResult = { ok: true; entity_type: string; id: string } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidHomeworksSyncPayload(value: unknown): value is HomeworksSyncPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.entity_type) || !isNonEmptyString(v.homeworks_id)) return false;
  if (v.entity_type === "property" || v.entity_type === "invoice") {
    return isNonEmptyString(v.customer_homeworks_id);
  }
  return v.entity_type === "customer";
}

export async function syncHomeworksEntity(
  supabase: SupabaseClient<Database>,
  payload: HomeworksSyncPayload,
): Promise<HomeworksSyncResult> {
  try {
    switch (payload.entity_type) {
      case "customer": {
        const { data, error } = await supabase
          .from("clients")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              first_name: payload.first_name ?? null,
              last_name: payload.last_name ?? null,
              company_name: payload.company_name ?? null,
              email: payload.email ?? null,
              phone: payload.phone ?? null,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
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
              street: payload.street ?? null,
              city: payload.city ?? null,
              state: payload.state ?? null,
              zip: payload.zip ?? null,
              property_name: payload.property_name ?? null,
              active: true,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
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
        return { ok: true, entity_type: "invoice", id: data.id };
      }
    }
  } catch (err) {
    const message = extractErrorMessage(err);
    console.error("[homeworks-sync]", message, err);
    return { ok: false, error: message };
  }
}
