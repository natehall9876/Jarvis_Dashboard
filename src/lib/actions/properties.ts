"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, optionalNumber, requiredString, checkbox, withError, runMutation } from "./shared";
import type { PropertyInsert } from "@/types/domain";

function propertyFieldsFromForm(formData: FormData): PropertyInsert {
  return {
    client_id: requiredString(formData, "client_id"),
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
    if (!fields.street) throw new Error("Street address is required.");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("properties").insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError(`/properties?new=1&client=${fields.client_id}`, result.message));
  redirect(`/properties/${result.data}`);
}

export async function updateProperty(propertyId: string, formData: FormData) {
  const fields = propertyFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("properties").update(fields).eq("id", propertyId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/properties/${propertyId}?edit=1`, result.message));
  redirect(`/properties/${propertyId}`);
}

export async function archiveProperty(propertyId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("properties").update({ active: false }).eq("id", propertyId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/properties/${propertyId}`, result.message));
  redirect(`/properties/${propertyId}`);
}
