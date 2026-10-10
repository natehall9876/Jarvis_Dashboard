import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireIntegrationOwner } from "@/lib/integrations/owner-auth";
export const dynamic = "force-dynamic";
const labels: Record<string, string> = { customers: "Customers", properties: "Properties", events: "Scheduled work", estimates: "Estimates", invoices: "Invoices", payments: "Payments", items: "Services & items", users: "Assignments & team" };
type Source = { homeworks_id: string; changed_at: string; projected_id: string | null; payload: Record<string, unknown> };
function display(value: unknown): string { return value == null ? "—" : String(value); }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Never"; }
function notes(p: Record<string, unknown>) { return [p.description,p.notes,p.internalNotes].filter(Boolean).join("\n"); }
export default async function HomeworksPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  const auth = await requireIntegrationOwner();
  if (!auth.ok) return <p>{auth.message}</p>;
  const params = await searchParams;
  const entity = params.entity && params.entity in labels ? params.entity : "events";
  const page = Math.max(0, Number.parseInt(params.page ?? "0",10) || 0);
  const db = await createSupabaseServerClient() as unknown as SupabaseClient;
  const [records,run,states] = await Promise.all([
    db.from("homeworks_records").select("*", { count: "exact" }).eq("entity",entity).order("changed_at",{ascending:false}).order("homeworks_id").range(page*100,page*100+99),
    db.from("homeworks_sync_runs").select("*").order("started_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("homeworks_sync_state").select("stream,last_success_at,last_error"),
  ]);
  const stale = !run.data?.completed_at || new Date().getTime()-Date.parse(run.data.completed_at)>15*60_000;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Homeworks live operations</h1><p className="text-sm text-zinc-400">Automatic sync every 5 minutes. Full reconciliation daily. Times shown in America/New_York.</p></div>
    <div className="rounded-xl border border-zinc-700 p-4"><p>Last run: <strong>{display(run.data?.status)}</strong> · {date(run.data?.completed_at ?? run.data?.started_at)}</p>{stale && <p className="text-amber-400">Sync is not yet verified current. Check the latest run below.</p>}{run.data?.error && <p className="text-red-400">{run.data.error}</p>}<p className="text-sm text-zinc-400">{states.data?.filter(s=>s.last_success_at).length ?? 0} source streams have a successful checkpoint. {run.data?.records ?? 0} records changed in the latest run.</p></div>
    <nav className="flex flex-wrap gap-3">{Object.entries(labels).map(([key,label])=><Link key={key} className={entity===key ? "text-green-400 font-semibold" : "text-zinc-300"} href={`/homeworks?entity=${key}`}>{label}</Link>)}</nav>
    {(records.error || run.error || states.error) && <p className="text-red-400">Homeworks data could not be loaded. No empty count should be treated as a verified zero.</p>}
    <p>{records.count ?? "Unknown"} {labels[entity].toLowerCase()} records, including source archives/deletions. Deleted records are retained for history.</p>
    <div className="space-y-3">{(records.data as Source[] ?? []).map(row=>{
      const p=row.payload; const title=p.fullName || p.title || p.name || [p.firstName,p.lastName].filter(Boolean).join(" ") || (p.number ? `#${p.number}` : `${labels[entity]} ${row.homeworks_id}`);
      const address=p.address as Record<string,unknown>|undefined;
      const lineItems=p.lineItems as Record<string,unknown>[]|undefined;
      const users=p.users as Record<string,unknown>[]|undefined;
      const dispatch=p.dispatchNotes as Record<string,unknown>[]|undefined;
      return <article key={row.homeworks_id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{String(title)}</h2><span>{display(p.status ?? p.deletedStatus ?? p.type ?? (p.__deleted ? "Deleted" : ""))}</span></div>
        <p className="text-sm text-zinc-400">Homeworks ID {row.homeworks_id} · Updated in Jarvis {date(row.changed_at)}{(p.__deleted || p.isDeleted || (p.deletedState && p.deletedState!=="ACTIVE")) ? " · Deleted in Homeworks" : ""}</p>
        {(p.startDate || p.date) ? <p>Service/date: {display(p.startDate ?? p.date)} {p.hasTime ? display(p.startTime) : ""}</p> : null}
        {p.total != null || p.totalAmount != null || p.price != null ? <p>Amount: ${Number(p.total ?? p.totalAmount ?? p.price).toFixed(2)} {p.paidAmount != null ? `· Paid: $${Number(p.paidAmount).toFixed(2)}` : ""}</p> : null}
        {[p.email,p.phone,p.cell].filter(Boolean).length ? <p>{[p.email,p.phone,p.cell].filter(Boolean).map(String).join(" · ")}</p> : null}
        {address && <p>{[address.street1,address.street2,address.city,address.state,address.zip].filter(Boolean).map(String).join(", ")}</p>}
        {notes(p) && <p className="whitespace-pre-wrap mt-2">{notes(p)}</p>}
        {users?.length ? <p>Assigned: {users.map(u=>[u.firstName,u.lastName].filter(Boolean).join(" ")).join(", ")}</p> : null}
        {lineItems?.length ? <details className="mt-2"><summary>Services and pricing ({lineItems.length})</summary><ul>{lineItems.map(item=><li key={String(item.id)}>{display(item.name)} · {display(item.quantity)} × ${Number(item.price).toFixed(2)}{item.description ? ` · ${item.description}` : ""}</li>)}</ul></details> : null}
        {dispatch?.length ? <details><summary>Dispatch notes ({dispatch.length})</summary>{dispatch.map((n,i)=><p key={i}>{display(n.message)} — {display(n.author)} · {date(n.date)}</p>)}</details> : null}
        {entity==="events" && !row.projected_id && <p className="text-amber-400 text-sm">Homeworks calendar event has no linked property; shown here without inventing a job property.</p>}
      </article>;
    })}</div>
    <div className="flex gap-4">{page>0&&<Link href={`/homeworks?entity=${entity}&page=${page-1}`}>Previous</Link>}{(records.count??0)>(page+1)*100&&<Link href={`/homeworks?entity=${entity}&page=${page+1}`}>Next 100</Link>}</div>
  </div>;
}
