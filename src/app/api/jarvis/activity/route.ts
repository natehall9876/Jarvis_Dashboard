import {activityOwner,activityFailure,assertSameOrigin,check,activitySetup,ActivityError} from '@/lib/jarvis/background-auth';
import {DEFAULT_ACTIVITY_PREFERENCES} from '@/lib/jarvis/reminder-model';
export async function GET() { try {
 const {db,ownerId}=await activityOwner();
 const [jobs,prefs,notices,reminders]=await Promise.all([
 db.from('jarvis_background_jobs').select('id,kind,status,created_at,finished_at,result,error').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(20),
 db.from('jarvis_activity_preferences').select('*').eq('owner_id',ownerId).maybeSingle(),
 db.from('jarvis_notifications').select('*').eq('owner_id',ownerId).is('acknowledged_at',null).order('created_at',{ascending:false}).limit(20),db.from('jarvis_reminders').select('id,source_version,starts_at').eq('owner_id',ownerId).limit(101)]);
 for(const r of [jobs,prefs,notices,reminders]) check(r.error);
 return Response.json({jobs:jobs.data,preferences:prefs.data??DEFAULT_ACTIVITY_PREFERENCES,notifications:(notices.data??[]).filter(n=>!n.reminder_id||prefs.data?.reminders_enabled&&!prefs.data.last_worker_error&&prefs.data.last_checked_at&&Date.parse(prefs.data.last_checked_at)>Date.now()-180000&&(reminders.data??[]).some(r=>r.id===n.reminder_id&&r.source_version===n.source_version&&Date.parse(r.starts_at)>Date.now())),setup:activitySetup()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return activityFailure(e);} }
export async function POST(request:Request){try{
 assertSameOrigin(request);const {db}=await activityOwner();
 if(!activitySetup().workerConfigured)throw new ActivityError('Background worker is not configured. Your review was not queued.',503);
 const body=await request.json();if(!['operations','schedule','collections'].includes(body.kind))throw new ActivityError('Choose an available read-only review.',400);
 const {data,error}=await db.rpc('jarvis_enqueue_review',{p_kind:body.kind});
 if(error)throw new ActivityError(error.message.includes('already')||error.message.includes('limit')?error.message:'Review was not queued. Enable background reviews and check activity storage.',409);
 if(!data)throw new Error('Queue returned no durable job');return Response.json({job:data},{status:201});
 }catch(e){return activityFailure(e);} }
