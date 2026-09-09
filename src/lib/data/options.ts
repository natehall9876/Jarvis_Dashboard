import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { clientDisplayName, propertyAddress } from "@/lib/format";

/** Lightweight lookups for form <select> dropdowns — not full entity fetches. */

export async function getClientOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clients")
      .select("id, first_name, last_name, company_name")
      .order("first_name");
    if (error) throw error;
    return (data ?? []).map((c) => ({ id: c.id, label: clientDisplayName(c) }));
  });
}

export async function getPropertyOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("properties")
      .select("id, property_name, street, city, state, zip, client_id, client:clients(id, first_name, last_name, company_name)")
      .order("street");
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      clientId: p.client_id,
      label: `${propertyAddress(p)} — ${clientDisplayName(p.client as unknown as Parameters<typeof clientDisplayName>[0])}`,
    }));
  });
}

export async function getServiceOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("services")
      .select("id, name, default_price, default_budgeted_hours")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });
}

export async function getEmployeeOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("active", true)
      .order("first_name");
    if (error) throw error;
    return (data ?? []).map((e) => ({ id: e.id, label: [e.first_name, e.last_name].filter(Boolean).join(" ") }));
  });
}

export async function getRouteOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("routes").select("id, name, route_day").order("name");
    if (error) throw error;
    return data ?? [];
  });
}

export async function getJobOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id, scheduled_date, service:services(name), property:properties(street, property_name)")
      .order("scheduled_date", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((j) => {
      const property = j.property as unknown as { street: string | null; property_name: string | null } | null;
      const service = j.service as unknown as { name: string } | null;
      const label = [j.scheduled_date, service?.name, property?.property_name ?? property?.street].filter(Boolean).join(" — ");
      return { id: j.id, label: label || j.id };
    });
  });
}

export async function getEquipmentOptions() {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("equipment").select("id, name").order("name");
    if (error) throw error;
    return data ?? [];
  });
}
