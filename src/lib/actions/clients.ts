"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, withError, runMutation } from "./shared";
import type { ClientInsert } from "@/types/domain";

function clientFieldsFromForm(formData: FormData): ClientInsert {
  return {
    first_name: optionalString(formData, "first_name"),
    last_name: optionalString(formData, "last_name"),
    company_name: optionalString(formData, "company_name"),
    email: optionalString(formData, "email"),
    phone: optionalString(formData, "phone"),
    preferred_contact_method: optionalString(formData, "preferred_contact_method"),
    status: optionalString(formData, "status") ?? "active",
    notes: optionalString(formData, "notes"),
  };
}

export async function createClient(formData: FormData) {
  const fields = clientFieldsFromForm(formData);
  const result = await runMutation(async () => {
    if (!fields.first_name && !fields.company_name) {
      throw new Error("Enter at least a first name or a company name.");
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("clients").insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError("/clients?new=1", result.message));
  redirect(`/clients/${result.data}`);
}

export async function updateClient(clientId: string, formData: FormData) {
  const fields = clientFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("clients").update(fields).eq("id", clientId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/clients/${clientId}?edit=1`, result.message));
  redirect(`/clients/${clientId}`);
}

export async function archiveClient(clientId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("clients").update({ status: "inactive" }).eq("id", clientId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/clients/${clientId}`, result.message));
  redirect(`/clients/${clientId}`);
}
