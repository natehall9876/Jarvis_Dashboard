"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCustomers, type HomeworksCustomerSample } from "@/lib/integrations/homeworks-api";

/**
 * Read-only comparison between real, live Homeworks customers and what's
 * already in Supabase — never writes anything. This is the preview the
 * owner reviews before any bulk import is built/run; "would create" /
 * "would update" / "possible duplicate" are proposals, not actions.
 */
export type SyncPreviewRow = {
  homeworksId: string;
  name: string;
  propertyCount: number;
  action: "would_create" | "would_update" | "possible_duplicate";
  matchedExistingClientId?: string;
  matchedOn?: "homeworks_id" | "phone" | "email";
};

export type SyncPreviewResult =
  | {
      ok: true;
      totalHomeworksCustomers: number;
      pageCount: number;
      hitPageCap: boolean;
      wouldCreate: number;
      wouldUpdate: number;
      possibleDuplicates: number;
      rows: SyncPreviewRow[];
    }
  | { ok: false; message: string };

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export async function previewHomeworksSync(): Promise<SyncPreviewResult> {
  const homeworksResult = await getAllCustomers();
  if (!homeworksResult.ok) return { ok: false, message: homeworksResult.message };

  const supabase = await createSupabaseServerClient();
  const { data: existingClients, error } = await supabase.from("clients").select("id, homeworks_id, phone, email, first_name, last_name, company_name");
  if (error) return { ok: false, message: `Couldn't read existing Jarvis clients: ${error.message}` };

  const byHomeworksId = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const c of existingClients ?? []) {
    if (c.homeworks_id) byHomeworksId.set(c.homeworks_id, c.id);
    const phone = normalizePhone(c.phone);
    if (phone) byPhone.set(phone, c.id);
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), c.id);
  }

  const rows: SyncPreviewRow[] = homeworksResult.data.customers.map((customer: HomeworksCustomerSample) => {
    const name = customer.fullName || `${customer.firstName} ${customer.lastName}`.trim() || "(no name)";
    const existingById = byHomeworksId.get(customer.id);
    if (existingById) {
      return { homeworksId: customer.id, name, propertyCount: customer.properties.length, action: "would_update", matchedExistingClientId: existingById, matchedOn: "homeworks_id" };
    }
    const phone = normalizePhone(customer.phone || customer.cell);
    const existingByPhone = phone ? byPhone.get(phone) : undefined;
    if (existingByPhone) {
      return { homeworksId: customer.id, name, propertyCount: customer.properties.length, action: "possible_duplicate", matchedExistingClientId: existingByPhone, matchedOn: "phone" };
    }
    const email = customer.email?.toLowerCase().trim();
    const existingByEmail = email ? byEmail.get(email) : undefined;
    if (existingByEmail) {
      return { homeworksId: customer.id, name, propertyCount: customer.properties.length, action: "possible_duplicate", matchedExistingClientId: existingByEmail, matchedOn: "email" };
    }
    return { homeworksId: customer.id, name, propertyCount: customer.properties.length, action: "would_create" };
  });

  return {
    ok: true,
    totalHomeworksCustomers: homeworksResult.data.customers.length,
    pageCount: homeworksResult.data.pageCount,
    hitPageCap: homeworksResult.data.hitCap,
    wouldCreate: rows.filter((r) => r.action === "would_create").length,
    wouldUpdate: rows.filter((r) => r.action === "would_update").length,
    possibleDuplicates: rows.filter((r) => r.action === "possible_duplicate").length,
    rows,
  };
}
