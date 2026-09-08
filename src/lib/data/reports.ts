import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { clientDisplayName } from "@/lib/format";
import { laborCostPercent, quoteAcceptanceRate } from "@/lib/calculations";
import type { DataResult } from "@/types/domain";

export type ServiceRevenueRow = {
  serviceId: string | null;
  serviceName: string;
  jobCount: number;
  revenue: number;
  actualHours: number;
  revenuePerHour: number | null;
};

export type ClientRevenueRow = {
  clientId: string;
  clientName: string;
  jobCount: number;
  revenue: number;
};

export type RouteRevenueRow = {
  routeId: string;
  routeName: string;
  jobCount: number;
  revenue: number;
  actualHours: number;
  revenuePerHour: number | null;
};

export type ReportsSummary = {
  totalRevenue: number;
  totalLaborCost: number;
  laborCostPct: number | null;
  jobsCompleted: number;
  quoteAcceptancePct: number | null;
  byService: ServiceRevenueRow[];
  byClient: ClientRevenueRow[];
  byRoute: RouteRevenueRow[];
};

/** Reports for completed jobs in the last N days (default trailing 90). */
export async function getReportsSummary(days = 90): Promise<DataResult<ReportsSummary>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        `id, price, actual_hours, status, route_id, service_id,
         service:services(id, name),
         property:properties(id, client:clients(id, first_name, last_name, company_name)),
         route:routes(id, name)`,
      )
      .eq("status", "completed")
      .gte("scheduled_date", sinceStr);
    if (error) throw error;

    const completed = jobs ?? [];

    const employeesResp = await supabase.from("employees").select("id, hourly_rate");
    const rateByEmployee = new Map((employeesResp.data ?? []).map((e) => [e.id, e.hourly_rate ?? 0]));

    const jobIds = completed.map((j) => j.id);
    const { data: jobEmployees } = jobIds.length
      ? await supabase.from("job_employees").select("job_id, employee_id, hours_worked").in("job_id", jobIds)
      : { data: [] };

    const laborByJob = new Map<string, number>();
    for (const je of jobEmployees ?? []) {
      const rate = rateByEmployee.get(je.employee_id) ?? 0;
      const cost = (je.hours_worked ?? 0) * rate;
      laborByJob.set(je.job_id, (laborByJob.get(je.job_id) ?? 0) + cost);
    }

    let totalRevenue = 0;
    let totalLaborCost = 0;

    const serviceMap = new Map<string, ServiceRevenueRow>();
    const clientMap = new Map<string, ClientRevenueRow>();
    const routeMap = new Map<string, RouteRevenueRow>();

    for (const job of completed) {
      const price = job.price ?? 0;
      totalRevenue += price;
      totalLaborCost += laborByJob.get(job.id) ?? 0;
      const hours = job.actual_hours ?? 0;

      const service = job.service as unknown as { id: string; name: string } | null;
      const serviceKey = service?.id ?? "unassigned";
      const serviceRow =
        serviceMap.get(serviceKey) ??
        ({
          serviceId: service?.id ?? null,
          serviceName: service?.name ?? "Unassigned",
          jobCount: 0,
          revenue: 0,
          actualHours: 0,
          revenuePerHour: null,
        } satisfies ServiceRevenueRow);
      serviceRow.jobCount += 1;
      serviceRow.revenue += price;
      serviceRow.actualHours += hours;
      serviceMap.set(serviceKey, serviceRow);

      const property = job.property as unknown as {
        id: string;
        client: { id: string; first_name: string | null; last_name: string | null; company_name: string | null } | null;
      } | null;
      const client = property?.client ?? null;
      if (client) {
        const clientRow =
          clientMap.get(client.id) ??
          ({ clientId: client.id, clientName: clientDisplayName(client), jobCount: 0, revenue: 0 } satisfies ClientRevenueRow);
        clientRow.jobCount += 1;
        clientRow.revenue += price;
        clientMap.set(client.id, clientRow);
      }

      const route = job.route as unknown as { id: string; name: string } | null;
      if (route) {
        const routeRow =
          routeMap.get(route.id) ??
          ({ routeId: route.id, routeName: route.name, jobCount: 0, revenue: 0, actualHours: 0, revenuePerHour: null } satisfies RouteRevenueRow);
        routeRow.jobCount += 1;
        routeRow.revenue += price;
        routeRow.actualHours += hours;
        routeMap.set(route.id, routeRow);
      }
    }

    const byService = Array.from(serviceMap.values())
      .map((row) => ({ ...row, revenuePerHour: row.actualHours > 0 ? row.revenue / row.actualHours : null }))
      .sort((a, b) => b.revenue - a.revenue);

    const byClient = Array.from(clientMap.values()).sort((a, b) => b.revenue - a.revenue);

    const byRoute = Array.from(routeMap.values())
      .map((row) => ({ ...row, revenuePerHour: row.actualHours > 0 ? row.revenue / row.actualHours : null }))
      .sort((a, b) => b.revenue - a.revenue);

    const { data: quotes } = await supabase
      .from("quotes")
      .select("accepted_at, declined_at")
      .gte("created_at", sinceStr)
      .or("accepted_at.not.is.null,declined_at.not.is.null");
    const accepted = (quotes ?? []).filter((q) => q.accepted_at !== null).length;
    const decided = quotes?.length ?? 0;

    return {
      totalRevenue,
      totalLaborCost,
      laborCostPct: laborCostPercent(totalLaborCost, totalRevenue),
      jobsCompleted: completed.length,
      quoteAcceptancePct: quoteAcceptanceRate(accepted, decided),
      byService,
      byClient: byClient.slice(0, 10),
      byRoute,
    };
  });
}
