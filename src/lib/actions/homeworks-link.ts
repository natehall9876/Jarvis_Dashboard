"use server";

import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCustomers } from "@/lib/integrations/homeworks-api";
import {
  planLinks,
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

/** Retired: automatic sync owns the Homeworks projections. Performs no I/O. */
export async function confirmHomeworksLinks(_selection: { customerIds: string[]; propertyIds: string[] }): Promise<LinkConfirmResult> {
  void _selection; // Keep the retired action signature compatible with stale callers.
  return { ok: false, message: LEGACY_HOMEWORKS_WRITE_DISABLED };
}
