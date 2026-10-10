import { test, expect } from "@playwright/test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";
const job = (id:string, overrides:Record<string,unknown>={}) => ({id,property_id:id,scheduled_date:"2026-10-05",scheduled_start_time:null,stop_order:null,route_id:null,homeworks_id:null,homeworks_deleted:false,status:"scheduled",property:{client:{data_source:"homeworks_sync"}},...overrides});
function readFixture(rows:unknown[],stops:unknown[]=[]){
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async(input)=> {
  const url=new URL(String(input));
  return Response.json(url.pathname.endsWith("/route_stops")?stops:rows);
 }}});
 return loadServerModule<typeof import("../src/lib/data/jobs")>("src/lib/data/jobs.ts",{
 "@/lib/supabase/server":{createSupabaseServerClient:async()=>db},
 "@/lib/env":{isSupabaseConfigured:()=>true}
 });
}
test("saved stop order beats arbitrary provider row order and survives a fresh read",async()=>{
 const f=readFixture([job("third",{stop_order:3}),job("first",{stop_order:1}),job("second",{stop_order:2})]);
 for(let n=0;n<2;n++)expect((await f.getJobsForDate("2026-10-05")).data?.map(j=>j.id)).toEqual(["first","second","third"]);
});
test("source-deleted and demo jobs cannot leak into the operational schedule",async()=>{
 const f=readFixture([job("deleted",{homeworks_deleted:true}),job("real"),job("demo",{property:{client:{data_source:"demo"}}})]);
 expect((await f.getJobsForDate("2026-10-05")).data?.map(j=>j.id)).toEqual(["real"]);
});
test("saved weekday route order follows property IDs and does not manufacture missing visits",async()=>{
 const route={id:"route",active:true,route_day:"Monday"};
 const f=readFixture([job("b"),job("a")],[{id:"s1",property_id:"a",route_id:"route",stop_order:1,route},{id:"s2",property_id:"missing",route_id:"route",stop_order:2,route},{id:"s3",property_id:"b",route_id:"route",stop_order:3,route}]);
 const r=await f.getJobsForDate("2026-10-05");
 expect(r.data?.map(j=>[j.id,j.stop_order])).toEqual([["a",1],["b",3]]);
});
test("explicit Homeworks order wins over a saved weekday route preference",async()=>{
 const route={id:"route",active:true,route_day:"Monday"};
 const f=readFixture([job("a",{homeworks_id:"1",stop_order:2}),job("b",{homeworks_id:"2",stop_order:1})],[{id:"s1",property_id:"a",route_id:"route",stop_order:1,route},{id:"s2",property_id:"b",route_id:"route",stop_order:2,route}]);
 expect((await f.getJobsForDate("2026-10-05")).data?.map(j=>j.id)).toEqual(["b","a"]);
});
test("same-day unordered jobs have a stable time and ID tie-break",async()=>{
 const f=readFixture([job("b"),job("late",{scheduled_start_time:"10:00:00"}),job("a"),job("early",{scheduled_start_time:"08:00:00"})]);
 expect((await f.getJobsForDate("2026-10-05")).data?.map(j=>j.id)).toEqual(["early","late","a","b"]);
});
test("a missing job update cannot be reported as saved",async()=>{
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async()=>Response.json(null)}});
 const f=loadServerModule<typeof import("../src/lib/actions/jobs")>("src/lib/actions/jobs.ts",{
 "@/lib/supabase/server":{createSupabaseServerClient:async()=>db},"next/cache":{revalidatePath:()=>{}},
 "@/lib/integrations/owner-auth":{requireIntegrationOwner:async()=>({ok:true,userId:"owner"})},
 "@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},
 });
 await expect(f.updateJobFields("missing",{notes:"test"})).rejects.toThrow(/not found|changed|saved/i);
});

test("a Homeworks rejection leaves the local schedule unchanged",async()=>{
 let writes=0;
 const current=job("linked",{homeworks_id:"42",updated_at:"2026-10-06T12:00:00Z"});
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async(_url,init)=>{
  if(init?.method==="PATCH")writes++;
  return Response.json(current);
 }}});
 const f=loadServerModule<typeof import("../src/lib/actions/jobs")>("src/lib/actions/jobs.ts",{
  "@/lib/supabase/server":{createSupabaseServerClient:async()=>db},"next/cache":{revalidatePath:()=>{}},
  "@/lib/integrations/owner-auth":{requireIntegrationOwner:async()=>({ok:true,userId:"owner"})},
  "@/lib/integrations/homeworks-schedule-write":{writeHomeworksSchedule:async()=>{throw new Error("Homeworks rejected the schedule");}},
 });
 await expect(f.updateJobFields("linked",{scheduled_date:"2026-10-12"})).rejects.toThrow(/Homeworks/);
 expect(writes).toBe(0);
});
test("Homeworks-managed prices cannot be saved locally and silently revert next sync",async()=>{
 let writes=0;
 const current=job("linked",{homeworks_id:"42",price:65});
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async(_url,init)=>{
  if(init?.method==="PATCH")writes++;
  return Response.json(current);
 }}});
 const f=loadServerModule<typeof import("../src/lib/actions/jobs")>("src/lib/actions/jobs.ts",{
  "@/lib/supabase/server":{createSupabaseServerClient:async()=>db},"next/cache":{revalidatePath:()=>{}},
  "@/lib/integrations/homeworks-schedule-write":{writeHomeworksSchedule:async()=>{}},
 });
 await expect(f.updateJobFields("linked",{price:90})).rejects.toThrow(/Homeworks/);
 expect(writes).toBe(0);
});

function writerFixture(options:{denied?:boolean;busy?:boolean;projectionFails?:boolean;sourceError?:boolean}={}) {
 const operations:string[]=[]; const payloads:Record<string,unknown>[]=[];
 const event={id:42,startDate:"2026-10-05",startTime:null,hasTime:false,status:"OPEN",endDate:null,propertyId:101};
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  const name=new URL(String(input)).pathname.split("/").pop();
  if(name==="homeworks_claim_lease"){operations.push("claim");return Response.json(!options.busy);}
  if(name==="homeworks_release_lease"){operations.push("release");return Response.json(null);}
  if(name==="homeworks_apply_page"){operations.push("project");payloads.push(JSON.parse(String(init?.body)));return options.projectionFails?Response.json({message:"projection failed"},{status:500}):Response.json(1);}
  return Response.json({cursor:null});
 }}});
 const writer=loadServerModule<typeof import("../src/lib/integrations/homeworks-schedule-write")>("src/lib/integrations/homeworks-schedule-write.ts",{
  "@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},
  "./owner-auth":{requireIntegrationOwner:async()=>options.denied?{ok:false,message:"Owner access required"}:{ok:true,userId:"owner"}},
  "./homeworks-connection":{getValidAccessToken:async()=>({ok:true,accessToken:"test"})}
 },async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  if(body.query.includes("CurrentVisit")){operations.push("read-source");return Response.json({data:{events:[event]}});}
  operations.push("write-source");
  if(options.sourceError)return Response.json({errors:[{message:"calendar.UPDATE required"}]});
  const {date,time}=body.variables;
  return Response.json({data:{scheduleEvent:{...event,startDate:date,startTime:time,hasTime:!!time,routeStops:[],updatedAt:"2026-10-06T20:00:00Z"}}});
 });
 return {writer,operations,payloads};
}
test("rescheduling commits the verified Homeworks response before releasing the sync lock",async()=>{
 const f=writerFixture();
 await f.writer.writeHomeworksSchedule("42",{scheduled_date:"2026-10-12",scheduled_start_time:"09:30"});
 expect(f.operations).toEqual(["claim","read-source","write-source","project","release"]);
 expect(f.payloads[0]).toMatchObject({p_entity:"events",p_complete:false,p_rows:[{id:42,startDate:"2026-10-12",startTime:"09:30:00",hasTime:true}]});
});
test("source authorization failure never projects a local schedule",async()=>{
 const f=writerFixture({sourceError:true});
 await expect(f.writer.writeHomeworksSchedule("42",{scheduled_date:"2026-10-12"})).rejects.toThrow(/Homeworks/);
 expect(f.operations).toEqual(["claim","read-source","write-source","release"]);
 expect(f.payloads).toHaveLength(0);
});
test("a busy sync lease prevents a competing source write",async()=>{
 const f=writerFixture({busy:true});
 await expect(f.writer.writeHomeworksSchedule("42",{scheduled_date:"2026-10-12"})).rejects.toThrow(/syncing/);
 expect(f.operations).toEqual(["claim"]);
});
test("non-owner callers cannot reach Homeworks or its token store",async()=>{
 const f=writerFixture({denied:true});
 await expect(f.writer.writeHomeworksSchedule("42",{scheduled_date:"2026-10-12"})).rejects.toThrow(/Owner access/);
 expect(f.operations).toHaveLength(0);
});
test("source success followed by projection failure is reported as pending sync, not unsaved",async()=>{
 const f=writerFixture({projectionFails:true});
 await expect(f.writer.writeHomeworksSchedule("42",{scheduled_date:"2026-10-12"})).rejects.toThrow(/Saved in Homeworks/);
 expect(f.operations.at(-1)).toBe("release");
});

test("scheduling choices exclude archived routes, deleted Homeworks records, and confirmed demo customers/properties",async()=>{
 const customers=[
  {id:"real",first_name:"Real",data_source:"homeworks_sync",homeworks_deleted:false},
  {id:"demo",first_name:"Demo",data_source:"demo",homeworks_deleted:false},
  {id:"deleted",first_name:"Deleted",data_source:"homeworks_sync",homeworks_deleted:true},
 ];
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async(input)=>{
  const url=new URL(String(input));
  if(url.pathname.endsWith("/routes"))return Response.json(url.searchParams.get("active")==="eq.true"?[{id:"active"}]:[{id:"active"},{id:"archived"}]);
  if(url.pathname.endsWith("/clients"))return Response.json(customers);
  return Response.json(customers.map(c=>({id:c.id,client_id:c.id,street:c.id,homeworks_deleted:false,client:c})));
 }}});
 const f=loadServerModule<typeof import("../src/lib/data/options")>("src/lib/data/options.ts",{
  "@/lib/supabase/server":{createSupabaseServerClient:async()=>db},"@/lib/env":{isSupabaseConfigured:()=>true}
 });
 expect((await f.getRouteOptions()).data?.map(r=>r.id)).toEqual(["active"]);
 expect((await f.getClientOptions()).data?.map(r=>r.id)).toEqual(["real"]);
 expect((await f.getPropertyOptions()).data?.map(r=>r.id)).toEqual(["real"]);
});

test("duplicate client audit checks only active, non-demo customers",async()=>{
 const rows=[
  {id:"active",first_name:"Active",last_name:"Customer",phone:"4015550100",email:null,homeworks_id:"1",data_source:"homeworks_sync",created_at:"2026-10-01",homeworks_deleted:false},
  {id:"deleted",first_name:"Deleted",last_name:"Customer",phone:"4015550100",email:null,homeworks_id:"2",data_source:"homeworks_sync",created_at:"2026-10-02",homeworks_deleted:true},
  {id:"demo",first_name:"Demo",last_name:"Customer",phone:"4015550100",email:null,homeworks_id:null,data_source:"demo",created_at:"2026-10-03",homeworks_deleted:false},
 ];
 const db=createClient("https://example.supabase.co","test",{auth:{persistSession:false},global:{fetch:async(input)=>{
  const url=new URL(String(input));let filtered=rows;
  if(url.searchParams.get("homeworks_deleted")==="eq.false")filtered=filtered.filter(r=>!r.homeworks_deleted);
  if(url.searchParams.get("data_source")==="neq.demo")filtered=filtered.filter(r=>r.data_source!=="demo");
  return Response.json(filtered);
 }}});
 const f=loadServerModule<{findDuplicateClients:()=>Promise<{ok:boolean;clusters:unknown[];totalClientsChecked:number}>}>("src/lib/actions/client-duplicate-audit.ts",{
  "@/lib/supabase/server":{createSupabaseServerClient:async()=>db}
 });
 const result=await f.findDuplicateClients();
 expect(result.ok).toBe(true);
 if(result.ok){expect(result.totalClientsChecked).toBe(1);expect(result.clusters).toEqual([]);}
});

function duplicateAuditHarness(findDuplicateClients: () => Promise<unknown>) {
 let cursor=0;
 const state:unknown[]=[];
 const work:Promise<unknown>[]=[];
 const {DuplicateAuditPanel}=loadServerModule<{DuplicateAuditPanel:()=>ReactNode}>(
  "src/components/clients/duplicate-audit-panel.tsx",
  {
   react:{
    useState(initial:unknown){const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],(value:unknown)=>{state[index]=value;}];},
    useTransition:()=>[false,(run:()=>Promise<unknown>)=>{work.push(run());}],
   },
   "next/link":{default:(props:Record<string,unknown>&{children?:ReactNode})=>createElement("a",props,props.children)},
   "@/components/ui/button":{Button:(props:Record<string,unknown>&{children?:ReactNode})=>createElement("button",props,props.children)},
   "@/lib/actions/client-duplicate-audit":{findDuplicateClients},
  },
 );
 function tree(){cursor=0;return DuplicateAuditPanel();}
 function find(node:ReactNode,label:string):(()=>void)|undefined{
  if(Array.isArray(node))return node.map(child=>find(child,label)).find(Boolean);
  if(!isValidElement<{children?:ReactNode;onClick?:()=>void}>(node))return;
  if(node.props.onClick&&renderToStaticMarkup(node).includes(label))return node.props.onClick;
  return find(node.props.children,label);
 }
 return {
  html:()=>renderToStaticMarkup(tree()),
  async run(){const handler=find(tree(),"Run audit");expect(handler,"expected audit control").toBeTruthy();handler!();await Promise.allSettled(work.splice(0));},
 };
}

test("duplicate audit transport failure is safe, announced, and retryable",async()=>{
 let fails=true;
 const ui=duplicateAuditHarness(async()=>{
  if(fails)throw new Error("raw transport secret must not reach the UI");
  return {ok:true,clusters:[],totalClientsChecked:27};
 });
 await ui.run();
 expect(ui.html()).toContain("Duplicate audit could not be completed. Try again.");
 expect(ui.html()).toContain('role="alert"');
 expect(ui.html()).not.toContain("raw transport secret");
 fails=false;
 await ui.run();
 expect(ui.html()).toContain("No matching phone/email across 27 active clients");
 expect(ui.html()).toContain('role="status"');
 expect(ui.html()).not.toContain("could not be completed");
});

test("duplicate audit provider errors are alerts",async()=>{
 const ui=duplicateAuditHarness(async()=>({ok:false,message:"Client records could not be loaded."}));
 await ui.run();
 expect(ui.html()).toContain("Client records could not be loaded.");
 expect(ui.html()).toContain('role="alert"');
});

test("duplicate audit controls are truthful and mobile reachable",()=>{
 const ui=duplicateAuditHarness(async()=>({ok:true,clusters:[],totalClientsChecked:27}));
 const html=ui.html();
 expect(html).toContain("min-h-11");
 expect(html).toContain("min-h-11 w-full sm:w-auto");
 expect(html).toContain("checks active, non-demo clients");
 expect(html).not.toContain("across all clients");
});
