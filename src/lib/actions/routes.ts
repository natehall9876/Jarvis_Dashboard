"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, optionalNumber, checkbox, withError, runMutation } from "./shared";
import type { RouteInsert } from "@/types/domain";

function routeFieldsFromForm(formData: FormData): RouteInsert {
  return {
    name: requiredString(formData, "name"),
    route_day: optionalString(formData, "route_day"),
    start_location: optionalString(formData, "start_location"),
    active: checkbox(formData, "active"),
    notes: optionalString(formData, "notes"),
  };
}

export async function createRoute(formData: FormData) {
  const fields = routeFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("routes").insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError("/routes?new=1", result.message));
  redirect(`/routes/${result.data}`);
}

export async function updateRoute(routeId: string, formData: FormData) {
  const fields = routeFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("routes").update(fields).eq("id", routeId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/routes/${routeId}?edit=1`, result.message));
  redirect(`/routes/${routeId}`);
}

export async function archiveRoute(routeId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("routes").update({ active: false }).eq("id", routeId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/routes/${routeId}`, result.message));
  redirect(`/routes/${routeId}`);
}

export async function addRouteStop(routeId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase
      .from("route_stops")
      .select("id", { count: "exact", head: true })
      .eq("route_id", routeId);

    const { error } = await supabase.from("route_stops").insert({
      route_id: routeId,
      property_id: requiredString(formData, "property_id"),
      stop_order: count ?? 0,
      estimated_minutes: optionalNumber(formData, "estimated_minutes"),
      notes: optionalString(formData, "notes"),
    });
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/routes/${routeId}?addStop=1`, result.message));
  redirect(`/routes/${routeId}`);
}

export async function removeRouteStop(routeId: string, stopId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("route_stops").delete().eq("id", stopId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/routes/${routeId}`, result.message));
  redirect(`/routes/${routeId}`);
}
