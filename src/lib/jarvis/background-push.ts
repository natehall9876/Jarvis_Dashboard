import webpush from 'web-push';
import type {SupabaseClient} from '@supabase/supabase-js';
import {check} from './background-auth';
import {isQuietTime,type ActivityPreferences,type ActivityNotification} from './reminder-model';
/** Strict push service hosts prevent saved endpoints becoming an arbitrary HTTP proxy. */
export function validPushEndpoint(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2048)return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}
}
export async function deliverPush(db:SupabaseClient,ownerId:string,p:ActivityPreferences,notifications:ActivityNotification[],now:Date,deadline=Date.now()+15000){
 if(!p.push_enabled||isQuietTime(now,p)||!process.env.JARVIS_VAPID_PRIVATE_KEY||!process.env.JARVIS_VAPID_SUBJECT||!process.env.NEXT_PUBLIC_JARVIS_VAPID_PUBLIC_KEY)return;
 const subscriptions=await db.from('jarvis_push_subscriptions').select('id,endpoint,keys').eq('owner_id',ownerId).limit(5);check(subscriptions.error);if(!subscriptions.data?.length)return;
 for(const n of notifications.slice(0,1)){
 if(Date.now()>deadline-5000)return;
 const leaseToken=crypto.randomUUID();const claim=await db.from('jarvis_notifications').update({push_lease_token:leaseToken,push_lease_until:new Date(now.getTime()+60_000).toISOString()}).eq('owner_id',ownerId).eq('id',n.id).is('push_sent_at',null).is('acknowledged_at',null).or(`push_lease_until.is.null,push_lease_until.lt.${now.toISOString()}`).select('id,push_attempts').maybeSingle();check(claim.error);if(!claim.data||claim.data.push_attempts>=3)continue;
 let sent=false;let failure:string|null=null;
 for(const sub of subscriptions.data){if(Date.now()>deadline-5000)break;if(!validPushEndpoint(sub.endpoint))continue;try{
 await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({title:'Jarvis',body:n.reminder_id?'Your preparation reminder is ready. Open Jarvis for the event details.':n.title==='Review failed'?'A background review needs attention.':'Your background review is ready.',tag:n.id,url:'/workshop'}),{TTL:300,timeout:2000,vapidDetails:{subject:process.env.JARVIS_VAPID_SUBJECT,publicKey:process.env.NEXT_PUBLIC_JARVIS_VAPID_PUBLIC_KEY,privateKey:process.env.JARVIS_VAPID_PRIVATE_KEY}});sent=true;
 }catch(e){const status=(e as {statusCode?:number}).statusCode;failure=`Push delivery failed${status?` (${status})`:''}.`;if(status===404||status===410){const removed=await db.from('jarvis_push_subscriptions').delete().eq('owner_id',ownerId).eq('id',sub.id);check(removed.error);}}}
 const finish=await db.from('jarvis_notifications').update({push_sent_at:sent?new Date().toISOString():null,push_error:failure,push_attempts:claim.data.push_attempts+1,push_lease_until:sent?null:new Date(Date.now()+300_000).toISOString(),push_lease_token:null}).eq('owner_id',ownerId).eq('id',n.id).eq('push_lease_token',leaseToken);check(finish.error);
 }
}
