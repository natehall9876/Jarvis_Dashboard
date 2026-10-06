import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireIntegrationOwner } from "./owner-auth";
import { getValidAccessToken } from "./homeworks-connection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { HOMEWORKS_STREAMS } from "./homeworks-auto-streams";
import { isISODate } from "./homeworks-dates";
type SchedulePatch = { scheduled_date?: string | null; scheduled_start_time?: string | null; status?: string };
const statuses: Record<string,string> = { scheduled:"OPEN",completed:"CLOSED",cancelled:"CANCELLED",skipped:"SKIPPED" };

/** Source-first write, serialized with automatic projection so an older page cannot undo it. */
export async function writeHomeworksSchedule(id: string, patch: SchedulePatch): Promise<void> {
  const auth = await requireIntegrationOwner();
  if (!auth.ok) throw new Error(auth.message);
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error("Invalid Homeworks event.");
  const reschedule = patch.scheduled_date !== undefined || patch.scheduled_start_time !== undefined;
  if (patch.status !== undefined && !statuses[patch.status]) throw new Error("Homeworks does not support this status. Choose Scheduled, Completed, Cancelled or Skipped.");
  if (reschedule && patch.status !== undefined) throw new Error("Save the Homeworks date and status separately.");
  if (patch.scheduled_date !== undefined && (!patch.scheduled_date || !isISODate(patch.scheduled_date))) throw new Error("A valid Homeworks scheduled date is required.");
  if (patch.scheduled_start_time != null && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(patch.scheduled_start_time)) throw new Error("A valid start time is required.");
  const db = createSupabaseAdminClient() as unknown as SupabaseClient;
  const owner = randomUUID();
  const lease = await db.rpc("homeworks_claim_lease",{p_name:"sync",p_owner:owner,p_seconds:120});
  if (lease.error || lease.data !== true) throw new Error("Homeworks is syncing. Nothing was changed; retry shortly.");
  let sourceSaved = false;
  try {
    const token = await getValidAccessToken();
    if (!token.ok) throw new Error(token.message);
    const fields = HOMEWORKS_STREAMS.find(s=>s.entity==="events")!.fields;
    async function request(query:string,variables:Record<string,unknown>) {
      const response=await fetch("https://api.home.works/graphql", {method:"POST",cache:"no-store",signal:AbortSignal.timeout(20_000),
        headers:{"content-type":"application/json",authorization:"Bearer "+(token.ok ? token.accessToken : "")},body:JSON.stringify({query,variables})});
      if(!response.ok) throw new Error("Homeworks could not save the change (HTTP "+response.status+").");
      const body=await response.json();
      if(body.errors?.length || !body.data) throw new Error("Homeworks rejected the change. Check the visit in Homeworks; no local-only schedule was saved.");
      return body.data;
    }
    const read=await request(`query CurrentVisit($id:SafeInt!){events(where:{id:{equals:$id},isDeleted:false},take:1){${fields}}}`,{id:eventId});
    const current=read.events?.[0];
    if(!current || current.id!==eventId) throw new Error("Homeworks visit not found.");
    let event;
    if(reschedule) {
      const date=patch.scheduled_date ?? current.startDate;
      const time=patch.scheduled_start_time === undefined ? current.startTime : patch.scheduled_start_time;
      // Preserve multi-day duration when changing the start date.
      const end=current.endDate && !time ? new Date(Date.parse(current.endDate+"T12:00:00Z")+Date.parse(date+"T12:00:00Z")-Date.parse(current.startDate+"T12:00:00Z")).toISOString().slice(0,10) : null;
      const result=await request(`mutation SaveSchedule($id:SafeInt!,$date:LocalDate!,$time:LocalTime,$end:LocalDate){scheduleEvent(eventId:$id,startDate:$date,startTime:$time,endDate:$end){${fields}}}`,
        {id:eventId,date,time:time ? (time.length===5 ? time+":00" : time) : null,end});
      event=result.scheduleEvent;
      sourceSaved=true;
      if(!event || event.startDate!==date || Boolean(event.hasTime)!==Boolean(time) || (time && event.startTime?.slice(0,5)!==time.slice(0,5))) throw new Error("Homeworks returned an unexpected schedule. Refresh before retrying.");
    } else {
      const status=statuses[patch.status!];
      const result=await request(`mutation SaveStatus($id:SafeInt!,$status:EventStatus!){updateEventStatus(eventId:$id,status:$status){${fields}}}`,{id:eventId,status});
      event=result.updateEventStatus;
      sourceSaved=true;
      if(!event || event.status!==status) throw new Error("Homeworks returned an unexpected status. Refresh before retrying.");
    }
    sourceSaved=true;
    const state=await db.from("homeworks_sync_state").select("cursor").eq("stream","events_false").maybeSingle();
    if(state.error) throw state.error;
    const applied=await db.rpc("homeworks_apply_page",{p_owner:owner,p_stream:"events_false",p_entity:"events",p_rows:[{...event,__deleted:false}],p_cursor:state.data?.cursor??null,p_complete:false});
    if(applied.error) throw applied.error;
  } catch(error) {
    if(sourceSaved) throw new Error("Saved in Homeworks, but Jarvis could not refresh yet. Automatic sync will retry; refresh before making another change.");
    throw error;
  } finally {
    await db.rpc("homeworks_release_lease",{p_name:"sync",p_owner:owner});
  }
}
