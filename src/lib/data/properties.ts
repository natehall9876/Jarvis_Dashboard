import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type {
  DataResult,
  Invoice,
  Job,
  JobPhoto,
  Property,
  PropertyWithClient,
  Quote,
  Route,
  ServiceAgreement,
} from "@/types/domain";

export async function getProperties(search?: string): Promise<DataResult<PropertyWithClient[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("properties")
      .select("*, client:clients(id, first_name, last_name, company_name)")
      .order("street", { ascending: true });

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      query = query.or(`street.ilike.${term},city.ilike.${term},property_name.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as PropertyWithClient[];
  });
}

export type PropertyDetail = {
  property: Property;
  client: PropertyWithClient["client"];
  route: Route | null;
  agreements: ServiceAgreement[];
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  photos: JobPhoto[];
};

export async function getPropertyById(id: string): Promise<DataResult<PropertyDetail>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: property, error } = await supabase
      .from("properties")
      .select("*, client:clients(id, first_name, last_name, company_name)")
      .eq("id", id)
      .single();
    if (error) throw error;

    const propertyRow = property as unknown as PropertyWithClient;

    const [{ data: agreements }, { data: jobs }, { data: quotes }, { data: invoices }, { data: routeStop }] =
      await Promise.all([
        supabase.from("service_agreements").select("*").eq("property_id", id),
        supabase
          .from("jobs")
          .select("*")
          .eq("property_id", id)
          .order("scheduled_date", { ascending: false })
          .limit(50),
        supabase.from("quotes").select("*").eq("property_id", id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("property_id", id).order("invoice_date", { ascending: false }),
        // properties don't carry a route_id directly — find the route via route_stops.
        supabase.from("route_stops").select("route_id").eq("property_id", id).limit(1).maybeSingle(),
      ]);

    let route: Route | null = null;
    if (routeStop?.route_id) {
      const { data } = await supabase.from("routes").select("*").eq("id", routeStop.route_id).single();
      route = data ?? null;
    }

    const jobIds = (jobs ?? []).map((j) => j.id);
    const { data: photos } = jobIds.length
      ? await supabase.from("job_photos").select("*").in("job_id", jobIds)
      : { data: [] };

    return {
      property: propertyRow,
      client: propertyRow.client,
      route,
      agreements: agreements ?? [],
      jobs: jobs ?? [],
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      photos: photos ?? [],
    };
  });
}
