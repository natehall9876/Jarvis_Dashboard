"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, optionalNumber, checkbox, withError, runMutation } from "./shared";
import type { EmployeeInsert } from "@/types/domain";
import { getOwnershipRecord, isRecordHomeworksOwned, rejectOwnershipFields, requireLocalRecord, requireNativeChanges, submittedFields } from "./homeworks-ownership";

function employeeFieldsFromForm(formData: FormData, currentFirstName?: string): EmployeeInsert {
  return {
    first_name: formData.has("first_name") ? requiredString(formData, "first_name") : currentFirstName ?? requiredString(formData, "first_name"),
    last_name: optionalString(formData, "last_name"),
    phone: optionalString(formData, "phone"),
    email: optionalString(formData, "email"),
    role: optionalString(formData, "role") ?? "crew_member",
    hourly_rate: optionalNumber(formData, "hourly_rate"),
    has_drivers_license: checkbox(formData, "has_drivers_license"),
    active: checkbox(formData, "active"),
    hire_date: optionalString(formData, "hire_date"),
    notes: optionalString(formData, "notes"),
  };
}

export async function createEmployee(formData: FormData) {
  const fields = employeeFieldsFromForm(formData);
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("employees").insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError("/employees?new=1", result.message));
  redirect(`/employees/${result.data}`);
}

export async function updateEmployee(employeeId: string, formData: FormData) {
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
    const supabase = await createSupabaseServerClient();
    const current = await getOwnershipRecord(supabase, "employees", employeeId);
    let fields = submittedFields(formData, employeeFieldsFromForm(formData, current.first_name));
    if (await isRecordHomeworksOwned(supabase, "employees", current)) {
      const allowed = ["notes", "hourly_rate", "role", "has_drivers_license", "hire_date"];
      requireNativeChanges(current, fields, allowed);
      fields = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
    } else {
      fields.active = checkbox(formData, "active");
      fields.has_drivers_license = checkbox(formData, "has_drivers_license");
    }
    if (!Object.keys(fields).length) return;
    const { error } = await supabase.from("employees").update(fields).eq("id", employeeId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/employees/${employeeId}?edit=1`, result.message));
  redirect(`/employees/${employeeId}`);
}

export async function archiveEmployee(employeeId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    await requireLocalRecord(supabase, "employees", employeeId);
    const { error } = await supabase.from("employees").update({ active: false }).eq("id", employeeId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/employees/${employeeId}`, result.message));
  redirect(`/employees/${employeeId}`);
}
