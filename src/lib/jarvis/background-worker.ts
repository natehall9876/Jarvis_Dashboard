import type {SupabaseClient} from '@supabase/supabase-js';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {todayInZone,addDaysISO} from '@/lib/integrations/homeworks-dates';
import {check} from './background-auth';
import {buildReview,type ReviewJobRow,type ReviewInvoiceRow} from './background-review';
import {workerCalendarEvents} from './background-calendar';
import {deliverPush} from './background-push';
import {reminderFor,scheduleInstant,isQuietTime,type ActivityPreferences,type SourceEvent,type ActivityNotification,type BackgroundJob} from './reminder-model';

async function verifyOwner(db:SupabaseClient,ownerId:string){const r=await db.from('app_members').select('role,active').eq('user_id',ownerId).maybeSingle();check(r.error);if(!r.data?.active||r.data.role!=='owner')throw new Error('Active owner access is no longer available.');}
/** Existing source tables represent one shared business, with active-owner RLS
 * rather than per-row tenant columns. Verify the queued owner before every
 * bounded source read; never accept an owner ID from a worker HTTP payload. */
async function readJobs(db:SupabaseClient,ownerId:string,now:Date):Promise<ReviewJobRow[]>{await verifyOwner(db,ownerId);const today=todayInZone(now);const r=await db.from('jobs').select('id,updated_at,scheduled_date,scheduled_start_time,status,homeworks_deleted,budgeted_hours,service:services(name),property:properties(street,client:clients(data_source))').gte('scheduled_date',addDaysISO(today,-31)).lte('scheduled_date',addDaysISO(today,7)).order('id').limit(501).abortSignal(AbortSignal.timeout(10_000));check(r.error);if(!r.data||r.data.length>500)throw new Error('Schedule exceeds the safe 500-record window. No partial review was published.');return r.data as unknown as ReviewJobRow[];}
async function readInvoices(db:SupabaseClient,ownerId:string,now:Date):Promise<ReviewInvoiceRow[]>{await verifyOwner(db,ownerId);const r=await db.from('invoices').select('id,invoice_number,status,total,amount_paid,due_date,homeworks_deleted,client:clients(data_source)').lt('due_date',todayInZone(now)).not('status','in','(draft,void,paid)').order('id').limit(501).abortSignal(AbortSignal.timeout(10_000));check(r.error);if(!r.data||r.data.length>500)throw new Error('Collections exceeds the safe 500-record window. No partial review was published.');return r.data as unknown as ReviewInvoiceRow[];}
function scheduleEvents(jobs:ReviewJobRow[]):SourceEvent[]{return jobs.flatMap(j=>{if(!j.scheduled_date||j.homeworks_deleted||j.property?.client?.data_source==='demo'||['completed','cancelled','skipped'].includes(j.status))return [];const start=scheduleInstant(j.scheduled_date,j.scheduled_start_time);return start?[{id:j.id,source:'schedule' as const,title:j.service?.name??'Scheduled job',starts_at:start,version:(j as ReviewJobRow&{updated_at?:string}).updated_at??start,location:(j.property as {street?:string}|null)?.street??null}]:[];});}
export async function runActivityWorker(){const db=createSupabaseAdminClient() as unknown as SupabaseClient;const now=new Date();const deadline=Date.now()+90000;let completed=0,failed=0;
 // One bounded review per invocation. Expired leases are retried, with a finite cap.
 for(let index=0;index<1;index++){const token=crypto.randomUUID();const claimed=await db.rpc('jarvis_claim_review',{p_token:token});check(claimed.error);const job=(claimed.data as (BackgroundJob&{owner_id:string;attempts:number})[]|null)?.[0];if(!job)break;let result:BackgroundJob['result']=null;let error:string|null=null;
 try{await verifyOwner(db,job.owner_id);const prefs=await db.from('jarvis_activity_preferences').select('background_enabled').eq('owner_id',job.owner_id).maybeSingle();check(prefs.error);if(!prefs.data?.background_enabled)throw new Error('Background reviews have been disabled.');if(job.attempts>3)throw new Error('Review exceeded the retry limit after an interrupted worker.');const jobs=job.kind==='collections'?[]:await readJobs(db,job.owner_id,now);const invoices=job.kind==='schedule'?[]:await readInvoices(db,job.owner_id,now);result=buildReview(job.kind,jobs,invoices,now);
 }catch(e){error=e instanceof Error?e.message.slice(0,500):'The source review failed.';}
 const finish=await db.rpc('jarvis_finish_review',{p_id:job.id,p_token:token,p_result:result,p_error:error});check(finish.error);if(finish.data!==true)throw new Error('Review lease expired before its result could be saved.');if(error)failed++;else completed++;
 }
 const preferences=await db.from('jarvis_activity_preferences').select('*').or('reminders_enabled.eq.true,push_enabled.eq.true').order('last_checked_at',{ascending:true,nullsFirst:true}).limit(1);check(preferences.error);const sourceErrors:string[]=[];
 for(const p of (preferences.data??[]) as (ActivityPreferences&{owner_id:string})[]){let workerError:string|null=null;const ownerLease=crypto.randomUUID();const locked=await db.from('jarvis_activity_preferences').update({worker_lease_token:ownerLease,worker_lease_until:new Date(Date.now()+120_000).toISOString()}).eq('owner_id',p.owner_id).or(`worker_lease_until.is.null,worker_lease_until.lt.${now.toISOString()}`).select('owner_id').maybeSingle();check(locked.error);if(!locked.data)continue;
 try{await verifyOwner(db,p.owner_id);if(p.reminders_enabled){
 const jobs=await readJobs(db,p.owner_id,now);let events=scheduleEvents(jobs).filter(e=>Date.parse(e.starts_at)>now.getTime());
 // Failure in either authoritative source preserves reminders but never delivers
 // a potentially stale one. Calendar events are from the owner's selected calendar.
 events=[...events,...await workerCalendarEvents(db,p.owner_id,now,deadline)];
 if(events.length>100)throw new Error('Upcoming timed events exceed the 100-event reminder limit. No partial refresh was saved.');
 const synced=await db.rpc('jarvis_sync_reminders',{p_owner:p.owner_id,p_events:events.map(e=>reminderFor(e,p))});check(synced.error);
 const due=await db.from('jarvis_reminders').select('*').eq('owner_id',p.owner_id).is('acknowledged_at',null).lte('due_at',now.toISOString()).gt('starts_at',now.toISOString()).limit(30);check(due.error);
 if(!isQuietTime(new Date(),p))for(const r of due.data??[]){if(Date.parse(r.starts_at)<=Date.now())continue;if(r.snoozed_until&&Date.parse(r.snoozed_until)>Date.now())continue;const notice=await db.from('jarvis_notifications').upsert({owner_id:p.owner_id,dedup_key:`reminder:${r.id}:${r.source_version}`,reminder_id:r.id,source_version:r.source_version,title:'Time to prepare',body:r.body},{onConflict:'owner_id,dedup_key',ignoreDuplicates:true});check(notice.error);}
 }
 const notices=await db.from('jarvis_notifications').select('*').eq('owner_id',p.owner_id).is('push_sent_at',null).is('acknowledged_at',null).lt('push_attempts',3).or(`push_lease_until.is.null,push_lease_until.lt.${now.toISOString()}`).order('created_at').limit(20);check(notices.error);
 const current=await db.from('jarvis_reminders').select('id,source_version,starts_at').eq('owner_id',p.owner_id).limit(1001);check(current.error);
 const eligible=(notices.data??[]).filter(n=>(!n.snoozed_until||Date.parse(n.snoozed_until)<=Date.now())&&(!n.reminder_id||p.reminders_enabled&&(current.data??[]).some(r=>r.id===n.reminder_id&&r.source_version===n.source_version&&Date.parse(r.starts_at)>Date.now())));
 await deliverPush(db,p.owner_id,p,eligible as ActivityNotification[],now,deadline);
 }catch(e){workerError=e instanceof Error?e.message.slice(0,500):'Reminder refresh failed.';sourceErrors.push(workerError);}
 const saved=await db.from('jarvis_activity_preferences').update({last_checked_at:new Date().toISOString(),last_worker_error:workerError,worker_lease_until:null,worker_lease_token:null}).eq('owner_id',p.owner_id).eq('worker_lease_token',ownerLease);check(saved.error);
 }
 return {completed,failed,ownersChecked:preferences.data?.length??0,sourceErrors};
}
