"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, withError, runMutation } from "./shared";
import type { ClientInsert } from "@/types/domain";
import { getOwnershipRecord, isRecordHomeworksOwned, rejectOwnershipFields, requireLocalRecord, requireNativeChanges, submittedFields } from "./homeworks-ownership";

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
    // Typed in by the owner through this form, by definition not demo data —
    // stamped explicitly rather than left to the column's 'unverified'
    // default, which is for pre-existing records of genuinely unknown origin.
    data_source: "owner_verified",
  };
}

export async function createClient(formData: FormData) {
  const fields = clientFieldsFromForm(formData);
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
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
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
    const supabase = await createSupabaseServerClient();
    const current = await getOwnershipRecord(supabase, "clients", clientId);
    let fields = submittedFields(formData, clientFieldsFromForm(formData));
    if (await isRecordHomeworksOwned(supabase, "clients", current)) {
      requireNativeChanges(current, fields, ["notes"]);
      fields = submittedFields(formData, { notes: optionalString(formData, "notes") });
    }
    if (!Object.keys(fields).length) return;
    const { error } = await supabase.from("clients").update(fields).eq("id", clientId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/clients/${clientId}?edit=1`, result.message));
  redirect(`/clients/${clientId}`);
}

export async function archiveClient(clientId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    await requireLocalRecord(supabase, "clients", clientId);
    const { error } = await supabase.from("clients").update({ status: "inactive" }).eq("id", clientId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/clients/${clientId}`, result.message));
  redirect(`/clients/${clientId}`);
}
