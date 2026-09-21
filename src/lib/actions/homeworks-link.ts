"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCustomers } from "@/lib/integrations/homeworks-api";
import { logActivity } from "@/lib/data/activity-log";
import type { Database } from "@/types/database.types";
import {
  clientLinkUpdate,
  planLinks,
  propertyLinkUpdate,
  type CustomerPlanRow,
  type LinkPlan,
} from "@/lib/integrations/homeworks-linking";

export type LinkPreviewResult =
  | { ok: true; plan: LinkPlan; homeworksCustomerCount: number; jarvisClientCount: number; jarvisPropertyCount: number }
  | { ok: false; message: string };

async function buildPlan(): Promise<
  | { ok: true; plan: LinkPlan; homeworksCustomerCount: number; jarvisClientCount: number; jarvisPropertyCount: number; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; message: string }
> {
  const hw = await getAllCustomers();
  if (!hw.ok) return { ok: false, message: hw.message };
  if (hw.data.hitCap) return { ok: false, message: "Homeworks returned more customers than the pagination safety cap — refusing to plan links from a partial list." };

  const supabase = await createSupabaseServerClient();
  const [clients, properties] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, company_name, email, phone, homeworks_id, data_source"),
    supabase.from("properties").select("id, client_id, property_name, street, city, state, zip, homeworks_id"),
  ]);
  if (clients.error) return { ok: false, message: `Couldn't read Jarvis clients: ${clients.error.message}` };
  if (properties.error) return { ok: false, message: `Couldn't read Jarvis properties: ${properties.error.message}` };

  const plan = planLinks(hw.data.customers, clients.data ?? [], properties.data ?? []);
  return {
    ok: true,
    plan,
    homeworksCustomerCount: hw.data.customers.length,
    jarvisClientCount: (clients.data ?? []).length,
    jarvisPropertyCount: (properties.data ?? []).length,
    supabase,
  };
}

/** Entirely read-only. Never writes to Jarvis or Homeworks. */
export async function previewHomeworksLinking(): Promise<LinkPreviewResult> {
  const built = await buildPlan();
  if (!built.ok) return built;
  const { plan, homeworksCustomerCount, jarvisClientCount, jarvisPropertyCount } = built;
  return { ok: true, plan, homeworksCustomerCount, jarvisClientCount, jarvisPropertyCount };
}

export type LinkAuditRow = {
  kind: "customer" | "property";
  hwId: string;
  label: string;
  outcome: "linked" | "skipped" | "ambiguous" | "manual_review" | "new_not_created" | "already_linked" | "error";
  detail: string;
};

export type LinkConfirmResult =
  | { ok: true; customersLinked: number; propertiesLinked: number; fieldsFilled: number; created: 0; skipped: number; errors: number; audit: LinkAuditRow[] }
  | { ok: false; message: string };

/**
 * The only write path for linking. Never trusts client-supplied state: it
 * recomputes the whole plan from live Homeworks + Jarvis data and applies
 * only rows that are (a) still classified safe_link right now AND (b)
 * explicitly selected by the owner. Every write is guarded by
 * `homeworks_id IS NULL`, so a row that changed since the preview (or was
 * already linked by a previous run) updates zero rows and is reported as
 * skipped rather than overwritten — which is also what makes re-running
 * this harmless.
 *
 * Not a single database transaction (supabase-js has none, and adding an
 * RPC would mean another migration); instead each row is an independent,
 * guarded, idempotent write, so a partial failure leaves only correct
 * links behind and re-running finishes the rest.
 *
 * Only ever writes: clients.homeworks_id, blank contact fields,
 * clients.data_source ('unverified' -> 'homeworks_sync' only),
 * properties.homeworks_id, and blank address fields. Never creates or
 * deletes a row, never touches notes, pricing, photos, or jobs.
 */
export async function confirmHomeworksLinks(selection: { customerIds: string[]; propertyIds: string[] }): Promise<LinkConfirmResult> {
  const built = await buildPlan();
  if (!built.ok) return built;
  const { plan, supabase } = built;
  const selectedCustomers = new Set(selection.customerIds);
  const selectedProperties = new Set(selection.propertyIds);

  const audit: LinkAuditRow[] = [];
  let customersLinked = 0;
  let propertiesLinked = 0;
  let fieldsFilled = 0;
  let errors = 0;

  async function linkProperties(row: CustomerPlanRow) {
    for (const p of row.properties) {
      const base = { kind: "property" as const, hwId: p.hwId, label: p.label };
      if (p.status === "already_linked") {
        audit.push({ ...base, outcome: "already_linked", detail: p.reason });
        continue;
      }
      if (p.status === "new_property") {
        audit.push({ ...base, outcome: "new_not_created", detail: p.reason });
        continue;
      }
      if (p.status === "ambiguous" || p.status === "manual_review") {
        audit.push({ ...base, outcome: p.status, detail: p.reason });
        continue;
      }
      if (!selectedProperties.has(p.hwId) || !p.property) {
        audit.push({ ...base, outcome: "skipped", detail: "Not selected for linking." });
        continue;
      }
      const { data, error } = await supabase
        .from("properties")
        .update(propertyLinkUpdate(p) as Database["public"]["Tables"]["properties"]["Update"])
        .eq("id", p.property.id)
        .is("homeworks_id", null)
        .select("id");
      if (error) {
        errors++;
        audit.push({ ...base, outcome: "error", detail: error.message });
      } else if (!data || data.length === 0) {
        audit.push({ ...base, outcome: "skipped", detail: "Property changed or was already linked since the preview — left untouched." });
      } else {
        propertiesLinked++;
        fieldsFilled += p.fills.length;
        audit.push({ ...base, outcome: "linked", detail: `Saved Homeworks property ID ${p.hwId} on Jarvis property "${p.property.label}"${p.fills.length ? `; filled blank: ${p.fills.map((f) => f.field).join(", ")}` : ""}.` });
        await logActivity({
          entityType: "property",
          entityId: p.property.id,
          eventType: "homeworks_linked",
          summary: `Linked to Homeworks property ${p.hwId}`,
          detail: { homeworks_id: p.hwId, filled: p.fills.map((f) => f.field) },
          source: "owner",
        });
      }
    }
  }

  for (const row of plan.customers) {
    const base = { kind: "customer" as const, hwId: row.hwId, label: row.hwName };

    if (row.status === "already_linked") {
      audit.push({ ...base, outcome: "already_linked", detail: row.reason });
      await linkProperties(row);
      continue;
    }
    if (row.status === "new_customer") {
      audit.push({ ...base, outcome: "new_not_created", detail: row.reason });
      continue;
    }
    if (row.status === "ambiguous" || row.status === "manual_review") {
      audit.push({ ...base, outcome: row.status, detail: row.reason });
      continue;
    }

    // safe_link
    if (!selectedCustomers.has(row.hwId) || !row.client) {
      audit.push({ ...base, outcome: "skipped", detail: "Not selected for linking — its properties were not touched either." });
      continue;
    }
    const { data, error } = await supabase
      .from("clients")
      .update(clientLinkUpdate(row) as Database["public"]["Tables"]["clients"]["Update"])
      .eq("id", row.client.id)
      .is("homeworks_id", null)
      .select("id");
    if (error) {
      errors++;
      audit.push({ ...base, outcome: "error", detail: error.message });
      continue;
    }
    if (!data || data.length === 0) {
      audit.push({ ...base, outcome: "skipped", detail: "Client changed or was already linked since the preview — left untouched." });
      continue;
    }
    customersLinked++;
    fieldsFilled += row.fills.length;
    audit.push({
      ...base,
      outcome: "linked",
      detail: `Saved Homeworks customer ID ${row.hwId} on existing client "${row.client.name}" (matched on phone ${row.matchedPhone})${row.fills.length ? `; filled blank: ${row.fills.map((f) => f.field).join(", ")}` : ""}.`,
    });
    await logActivity({
      entityType: "client",
      entityId: row.client.id,
      eventType: "homeworks_linked",
      summary: `Linked to Homeworks customer ${row.hwId} (phone match)`,
      detail: { homeworks_id: row.hwId, matched_phone: row.matchedPhone ?? null, filled: row.fills.map((f) => f.field) },
      source: "owner",
    });
    await linkProperties(row);
  }

  console.info("[homeworks-link] confirmed", JSON.stringify({ customersLinked, propertiesLinked, fieldsFilled, errors, audit }));

  revalidatePath("/clients");
  revalidatePath("/properties");
  revalidatePath("/settings");

  return {
    ok: true,
    customersLinked,
    propertiesLinked,
    fieldsFilled,
    created: 0,
    skipped: audit.filter((a) => a.outcome === "skipped").length,
    errors,
    audit,
  };
}
