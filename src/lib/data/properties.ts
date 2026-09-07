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
      .select("*, client:clients(id, name, company_name)")
      .order("address_line1", { ascending: true });

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      query = query.or(`address_line1.ilike.${term},city.ilike.${term}`);
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
      .select("*, client:clients(id, name, company_name)")
      .eq("id", id)
      .single();
    if (error) throw error;

    const propertyRow = property as unknown as PropertyWithClient;

    const [
      { data: route },
      { data: agreements },
      { data: jobs },
      { data: quotes },
      { data: invoices },
    ] = await Promise.all([
      propertyRow.route_id
        ? supabase.from("routes").select("*").eq("id", propertyRow.route_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("service_agreements").select("*").eq("property_id", id),
      supabase
        .from("jobs")
        .select("*")
        .eq("property_id", id)
        .order("scheduled_date", { ascending: false })
        .limit(50),
      supabase.from("quotes").select("*").eq("property_id", id).order("issue_date", { ascending: false }),
      supabase.from("invoices").select("*").eq("property_id", id).order("invoice_date", { ascending: false }),
    ]);

    const jobIds = (jobs ?? []).map((j) => j.id);
    const { data: photos } = jobIds.length
      ? await supabase.from("job_photos").select("*").in("job_id", jobIds)
      : { data: [] };

    return {
      property: propertyRow,
      client: propertyRow.client,
      route: (route as Route | null) ?? null,
      agreements: agreements ?? [],
      jobs: jobs ?? [],
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      photos: photos ?? [],
    };
  });
}
