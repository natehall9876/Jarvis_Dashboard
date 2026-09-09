"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, optionalNumber, withError, runMutation } from "./shared";
import type { EquipmentInsert, EquipmentUpdate } from "@/types/domain";

function equipmentFieldsFromForm(formData: FormData): EquipmentInsert {
  return {
    name: requiredString(formData, "name"),
    category: optionalString(formData, "category"),
    manufacturer: optionalString(formData, "manufacturer"),
    model: optionalString(formData, "model"),
    serial_number: optionalString(formData, "serial_number"),
    purchase_date: optionalString(formData, "purchase_date"),
    purchase_price: optionalNumber(formData, "purchase_price"),
    current_hours: optionalNumber(formData, "current_hours"),
    status: optionalString(formData, "status") ?? "active",
    maintenance_due_date: optionalString(formData, "maintenance_due_date"),
    maintenance_due_hours: optionalNumber(formData, "maintenance_due_hours"),
    notes: optionalString(formData, "notes"),
  };
}

export async function createEquipment(formData: FormData) {
  const fields = equipmentFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("equipment").insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError("/equipment?new=1", result.message));
  redirect(`/equipment/${result.data}`);
}

export async function updateEquipment(equipmentId: string, formData: FormData) {
  const fields = equipmentFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("equipment").update(fields).eq("id", equipmentId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/equipment/${equipmentId}?edit=1`, result.message));
  redirect(`/equipment/${equipmentId}`);
}

export async function retireEquipment(equipmentId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("equipment").update({ status: "out_of_service" }).eq("id", equipmentId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/equipment/${equipmentId}`, result.message));
  redirect(`/equipment/${equipmentId}`);
}

export async function logMaintenance(equipmentId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const maintenanceDate = optionalString(formData, "maintenance_date");
    const { error } = await supabase.from("equipment_maintenance").insert({
      equipment_id: equipmentId,
      maintenance_date: maintenanceDate,
      maintenance_type: requiredString(formData, "maintenance_type"),
      description: optionalString(formData, "description"),
      equipment_hours: optionalNumber(formData, "equipment_hours"),
      parts_cost: optionalNumber(formData, "parts_cost") ?? 0,
      labor_cost: optionalNumber(formData, "labor_cost") ?? 0,
      vendor: optionalString(formData, "vendor"),
      next_service_date: optionalString(formData, "next_service_date"),
      next_service_hours: optionalNumber(formData, "next_service_hours"),
    });
    if (error) throw error;

    // Logging a completed service naturally clears the "needs maintenance" flag.
    const currentHours = optionalNumber(formData, "equipment_hours");
    const nextDate = optionalString(formData, "next_service_date");
    const nextHours = optionalNumber(formData, "next_service_hours");
    const updatePayload: EquipmentUpdate = {
      status: "active",
      ...(currentHours !== null ? { current_hours: currentHours } : {}),
      ...(nextDate ? { maintenance_due_date: nextDate } : {}),
      ...(nextHours !== null ? { maintenance_due_hours: nextHours } : {}),
    };

    const { error: updateError } = await supabase.from("equipment").update(updatePayload).eq("id", equipmentId);
    if (updateError) throw updateError;
  });

  if (!result.ok) redirect(withError(`/equipment/${equipmentId}?log=1`, result.message));
  redirect(`/equipment/${equipmentId}`);
}
