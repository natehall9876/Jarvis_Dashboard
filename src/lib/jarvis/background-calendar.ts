import type {SupabaseClient} from '@supabase/supabase-js';
import {refreshAccessToken} from '@/lib/integrations/google-calendar-oauth';
import type {SourceEvent} from './reminder-model';
import {check} from './background-auth';
/** Called ONLY after worker verifies this owner's active membership. Tokens never leave server. */
export async function workerCalendarEvents(db:SupabaseClient,ownerId:string,now:Date,deadline=Date.now()+60000):Promise<SourceEvent[]> {
 const r=await db.from('google_calendar_oauth_connection').select('id,connected_by,selected_calendar_id,access_token,refresh_token,access_token_expires_at,updated_at').eq('connected_by',ownerId).limit(1).maybeSingle();check(r.error);
 if(!r.data?.selected_calendar_id)return [];
 const c=r.data;let token=c.access_token as string;
 if(Date.parse(c.access_token_expires_at)<now.getTime()+120_000){
 const refreshed=await refreshAccessToken(c.refresh_token);if(!refreshed.ok)throw new Error('Calendar authorization needs attention; upcoming calendar reminders could not be verified.');
 token=refreshed.data.access_token;const saved=await db.from('google_calendar_oauth_connection').update({access_token:token,access_token_expires_at:new Date(now.getTime()+refreshed.data.expires_in*1000).toISOString(),updated_at:now.toISOString()}).eq('id',c.id).eq('connected_by',ownerId).eq('updated_at',c.updated_at).select('id').maybeSingle();check(saved.error);if(!saved.data)throw new Error('Calendar authorization changed. Retry reminder refresh.');
 }
 const events:SourceEvent[]=[];let pageToken:string|undefined;
 for(let page=0;page<3;page++){
 if(Date.now()>deadline-10000)throw new Error('Calendar refresh reached its safe time budget. Prior reminders were preserved.');
 const url=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.selected_calendar_id)}/events`);
 const params={timeMin:now.toISOString(),timeMax:new Date(now.getTime()+7*86400_000).toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250',showDeleted:'false'};
 for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);if(pageToken)url.searchParams.set('pageToken',pageToken);
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10_000),cache:'no-store'});if(!response.ok)throw new Error(`Calendar source could not be verified (${response.status}).`);
 const body=await response.json();if(!body||typeof body!=='object'||body.kind!=='calendar#events')throw new Error('Calendar returned an invalid source response. Existing reminders were preserved.');if(body.items!==undefined&&!Array.isArray(body.items))throw new Error('Calendar returned an invalid event list.');
 for(const e of body.items??[]){if(!e||typeof e!=='object'||!['confirmed','tentative','cancelled'].includes(e.status))throw new Error('Calendar returned an invalid source event.');if(e.status==='cancelled'||!e.start?.dateTime)continue;if(typeof e.id!=='string'||!Number.isFinite(Date.parse(e.start.dateTime)))throw new Error('Calendar returned an invalid timed event.');events.push({id:`${c.selected_calendar_id}:${e.id}`,source:'calendar',title:typeof e.summary==='string'?e.summary:'Calendar event',starts_at:e.start.dateTime,version:typeof e.updated==='string'?e.updated:e.etag??e.start.dateTime,location:typeof e.location==='string'?e.location:null});}
 if(!body.nextPageToken)return events;if(typeof body.nextPageToken!=='string'||body.nextPageToken===pageToken)throw new Error('Calendar pagination was invalid.');pageToken=body.nextPageToken;
 }
 throw new Error('Calendar exceeded the bounded review window; no partial calendar reminder list was used.');
}
