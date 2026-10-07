"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, optionalNumber, requiredString, checkbox, withError, runMutation } from "./shared";
import type { PropertyInsert } from "@/types/domain";
import { getOwnershipRecord, isRecordHomeworksOwned, rejectOwnershipFields, requireLocalRecord, requireNativeChanges, submittedFields } from "./homeworks-ownership";

function propertyFieldsFromForm(formData: FormData, currentClientId?: string | null): PropertyInsert {
  return {
    client_id: formData.has("client_id") ? requiredString(formData, "client_id") : currentClientId !== undefined ? currentClientId : requiredString(formData, "client_id"),
    property_name: optionalString(formData, "property_name"),
    street: optionalString(formData, "street"),
    city: optionalString(formData, "city"),
    state: optionalString(formData, "state"),
    zip: optionalString(formData, "zip"),
    latitude: optionalNumber(formData, "latitude"),
    longitude: optionalNumber(formData, "longitude"),
    access_notes: optionalString(formData, "access_notes"),
    service_notes: optionalString(formData, "service_notes"),
    active: checkbox(formData, "active"),
  };
}

export async function createProperty(formData: FormData) {
  const fields = propertyFieldsFromForm(formData);
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
    if (!fields.street) throw new Error("Street address is required.");
    if (!fields.client_id) throw new Error("A client is required.");
    const supabase = await createSupabaseServerClient();
    await requireLocalRecord(supabase, "clients", fields.client_id);
    const { data, error } = await supabase.from("properties").insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError(`/properties?new=1&client=${fields.client_id}`, result.message));
  redirect(`/properties/${result.data}`);
}

export async function updateProperty(propertyId: string, formData: FormData) {
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
    const supabase = await createSupabaseServerClient();
    const current = await getOwnershipRecord(supabase, "properties", propertyId);
    let fields = submittedFields(formData, propertyFieldsFromForm(formData, current.client_id));
    if (await isRecordHomeworksOwned(supabase, "properties", current)) {
      requireNativeChanges(current, fields, ["access_notes", "service_notes"]);
      fields = submittedFields(formData, { access_notes: optionalString(formData, "access_notes"), service_notes: optionalString(formData, "service_notes") });
    } else {
      if (fields.client_id) await requireLocalRecord(supabase, "clients", fields.client_id);
      fields.active = checkbox(formData, "active");
    }
    if (!Object.keys(fields).length) return;
    const { error } = await supabase.from("properties").update(fields).eq("id", propertyId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/properties/${propertyId}?edit=1`, result.message));
  redirect(`/properties/${propertyId}`);
}

export async function archiveProperty(propertyId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    await requireLocalRecord(supabase, "properties", propertyId);
    const { error } = await supabase.from("properties").update({ active: false }).eq("id", propertyId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/properties/${propertyId}`, result.message));
  redirect(`/properties/${propertyId}`);
}
