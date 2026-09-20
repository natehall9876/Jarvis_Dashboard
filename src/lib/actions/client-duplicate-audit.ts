"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DuplicateCluster = {
  matchedOn: "phone" | "email";
  matchedValue: string;
  clients: { id: string; name: string; homeworksId: string | null; dataSource: string; createdAt: string }[];
};

export type DuplicateAuditResult = { ok: true; clusters: DuplicateCluster[]; totalClientsChecked: number } | { ok: false; message: string };

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/**
 * Entirely read-only — groups every Jarvis client by normalized phone and
 * by normalized email and reports any group with 2+ members. Never merges,
 * deletes, or changes anything; the owner decides what (if anything) to do
 * with each cluster manually. Built specifically to audit the real
 * duplicate-creation bug found 2026-09-20 (a stale/mismatched homeworks_id
 * on an existing client wrongly exempted it from the import's duplicate
 * check) — that bug is now fixed for future imports, but doesn't
 * retroactively clean up whatever it already created, which is exactly
 * what this surfaces for manual review.
 */
export async function findDuplicateClients(): Promise<DuplicateAuditResult> {
  const supabase = await createSupabaseServerClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, company_name, phone, email, homeworks_id, data_source, created_at")
    .order("created_at", { ascending: true });
  if (error) return { ok: false, message: error.message };

  const byPhone = new Map<string, typeof clients>();
  const byEmail = new Map<string, typeof clients>();
  for (const c of clients ?? []) {
    const phone = normalizePhone(c.phone);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), c]);
    const email = c.email?.toLowerCase().trim();
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), c]);
  }

  function name(c: { first_name: string | null; last_name: string | null; company_name: string | null }): string {
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "(unnamed)";
  }

  const clusters: DuplicateCluster[] = [];
  for (const [phone, group] of byPhone) {
    if (group.length > 1) {
      clusters.push({
        matchedOn: "phone",
        matchedValue: phone,
        clients: group.map((c) => ({ id: c.id, name: name(c), homeworksId: c.homeworks_id, dataSource: c.data_source, createdAt: c.created_at })),
      });
    }
  }
  for (const [email, group] of byEmail) {
    if (group.length > 1) {
      clusters.push({
        matchedOn: "email",
        matchedValue: email,
        clients: group.map((c) => ({ id: c.id, name: name(c), homeworksId: c.homeworks_id, dataSource: c.data_source, createdAt: c.created_at })),
      });
    }
  }

  return { ok: true, clusters, totalClientsChecked: (clients ?? []).length };
}
