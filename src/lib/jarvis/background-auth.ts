import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
export class ActivityError extends Error { constructor(message:string, public status=503){ super(message); } }
export async function activityOwner() {
  let db: SupabaseClient;
  try { db = await createSupabaseServerClient() as unknown as SupabaseClient; } catch { throw new ActivityError('Activity storage is not configured.',503); }
  const {data:{user},error} = await db.auth.getUser();
  if(error || !user) throw new ActivityError('Sign in to use Jarvis activity.',401);
  const membership = await db.from('app_members').select('role,active').eq('user_id',user.id).maybeSingle();
  if(membership.error) throw new ActivityError('Owner access could not be verified.',503);
  if(membership.data?.role !== 'owner' || !membership.data.active) throw new ActivityError('Active owner access is required.',403);
  return {db,ownerId:user.id};
}
export function activityFailure(error:unknown) { return Response.json({error:error instanceof ActivityError ? error.message : 'Activity storage is unavailable. Apply the Jarvis activity migration and retry.'},{status:error instanceof ActivityError ? error.status : 503}); }
export function assertSameOrigin(request:Request) { const origin=request.headers.get('origin'); if(origin && origin !== new URL(request.url).origin) throw new ActivityError('This request must come from Jarvis.',403); }
export function check(error:{message:string}|null) { if(error) throw new Error(error.message); }
export function activitySetup() { return { workerConfigured: Boolean(process.env.CRON_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY), pushConfigured: Boolean(process.env.NEXT_PUBLIC_JARVIS_VAPID_PUBLIC_KEY && process.env.JARVIS_VAPID_PRIVATE_KEY && process.env.JARVIS_VAPID_SUBJECT), delivery: 'Push requires a permitted device subscription; foreground speech requires Jarvis audio enabled.', scheduler: 'A server scheduler must call /api/jarvis/activity/worker every minute. Environment configuration alone does not verify the scheduler.' }; }
