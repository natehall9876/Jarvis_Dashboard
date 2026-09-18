"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCustomers, type HomeworksCustomerSample } from "@/lib/integrations/homeworks-api";
import { syncHomeworksEntity } from "@/lib/integrations/homeworks-sync";

export type ImportResultRow = {
  homeworksId: string;
  name: string;
  outcome: "created" | "updated" | "skipped_duplicate" | "error";
  detail?: string;
};

export type ImportResult =
  | {
      ok: true;
      totalCustomers: number;
      created: number;
      updated: number;
      skippedDuplicates: number;
      propertiesSynced: number;
      errors: number;
      rows: ImportResultRow[];
    }
  | { ok: false; message: string };

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/**
 * The only path that actually writes Homeworks customers/properties into
 * Supabase from the direct API — reuses syncHomeworksEntity, the same
 * already-tested upsert logic the Zapier webhook has used since it was
 * built, rather than a second, parallel write path. Idempotent by
 * homeworks_id (a real, fixed prior bug — see homeworks-integration-fix-
 * constraint.sql — made this safe to call repeatedly).
 *
 * Never called automatically. This is a Server Action; the only way it
 * executes is the owner clicking "Confirm Import" in their own
 * authenticated browser session, which is also the only session that can
 * reach it (this environment has no way to invoke a Server Action itself).
 *
 * Deliberately re-runs the exact same create/update/duplicate
 * classification as the preview rather than trusting client-supplied
 * state, so a stale preview can never cause a wrong write — and
 * `possible_duplicate` rows are always skipped, never auto-merged, no
 * matter how long ago the preview ran.
 */
export async function confirmHomeworksImport(): Promise<ImportResult> {
  const homeworksResult = await getAllCustomers();
  if (!homeworksResult.ok) return { ok: false, message: homeworksResult.message };

  const supabase = await createSupabaseServerClient();
  const { data: existingClients, error } = await supabase.from("clients").select("id, homeworks_id, phone, email");
  if (error) return { ok: false, message: `Couldn't read existing Jarvis clients: ${error.message}` };

  const byHomeworksId = new Set((existingClients ?? []).filter((c) => c.homeworks_id).map((c) => c.homeworks_id as string));
  const byPhone = new Map<string, boolean>();
  const byEmail = new Map<string, boolean>();
  for (const c of existingClients ?? []) {
    if (c.homeworks_id) continue; // already-synced clients aren't duplicate-match candidates for a different homeworks_id
    const phone = normalizePhone(c.phone);
    if (phone) byPhone.set(phone, true);
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), true);
  }

  const rows: ImportResultRow[] = [];
  let propertiesSynced = 0;

  for (const customer of homeworksResult.data.customers) {
    const name = customer.fullName || `${customer.firstName} ${customer.lastName}`.trim() || "(no name)";
    const isKnownById = byHomeworksId.has(customer.id);
    if (!isKnownById) {
      const phone = normalizePhone(customer.phone || customer.cell);
      const isDuplicatePhone = phone ? byPhone.get(phone) : false;
      const email = customer.email?.toLowerCase().trim();
      const isDuplicateEmail = email ? byEmail.get(email) : false;
      if (isDuplicatePhone || isDuplicateEmail) {
        rows.push({ homeworksId: customer.id, name, outcome: "skipped_duplicate", detail: "Matches an existing client by phone/email with no homeworks_id — review manually." });
        continue;
      }
    }

    const customerResult = await syncHomeworksEntity(supabase, {
      entity_type: "customer",
      homeworks_id: customer.id,
      first_name: customer.firstName || undefined,
      last_name: customer.lastName || undefined,
      email: customer.email || undefined,
      phone: customer.phone || customer.cell || undefined,
    });
    if (!customerResult.ok) {
      rows.push({ homeworksId: customer.id, name, outcome: "error", detail: customerResult.error });
      continue;
    }

    for (const property of customer.properties as HomeworksCustomerSample["properties"]) {
      const propertyResult = await syncHomeworksEntity(supabase, {
        entity_type: "property",
        homeworks_id: property.id,
        customer_homeworks_id: customer.id,
        street: property.address?.street1 || undefined,
        city: property.address?.city || undefined,
        state: property.address?.state || undefined,
        zip: property.address?.zip || undefined,
        property_name: property.name || undefined,
      });
      if (propertyResult.ok) propertiesSynced++;
    }

    rows.push({ homeworksId: customer.id, name, outcome: isKnownById ? "updated" : "created" });
  }

  revalidatePath("/clients");
  revalidatePath("/properties");
  revalidatePath("/settings");

  return {
    ok: true,
    totalCustomers: homeworksResult.data.customers.length,
    created: rows.filter((r) => r.outcome === "created").length,
    updated: rows.filter((r) => r.outcome === "updated").length,
    skippedDuplicates: rows.filter((r) => r.outcome === "skipped_duplicate").length,
    propertiesSynced,
    errors: rows.filter((r) => r.outcome === "error").length,
    rows,
  };
}
