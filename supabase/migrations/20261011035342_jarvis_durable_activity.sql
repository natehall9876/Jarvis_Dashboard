-- Durable read-only activity. No business-table writes and no Homeworks changes.
create table public.jarvis_activity_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 background_enabled boolean not null default false, reminders_enabled boolean not null default false,
 speech_enabled boolean not null default false, push_enabled boolean not null default false,
 prep_minutes integer not null default 10 check(prep_minutes between 0 and 180),
 travel_minutes integer not null default 20 check(travel_minutes between 0 and 180),
 timezone text not null default 'America/New_York', quiet_start text not null default '21:00' check(quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), quiet_end text not null default '07:00' check(quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 last_checked_at timestamptz, last_worker_error text
);
create table public.jarvis_background_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('operations','schedule','collections')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz, result jsonb, error text
);
create index jarvis_jobs_owner_created on public.jarvis_background_jobs(owner_id,created_at desc);
create index jarvis_jobs_pending on public.jarvis_background_jobs(status,created_at) where status in ('queued','running');
create table public.jarvis_reminders (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 source_id text not null, source_version text not null, title text not null, body text not null,
 starts_at timestamptz not null, due_at timestamptz not null, acknowledged_at timestamptz, snoozed_until timestamptz,
 unique(owner_id,source_id)
);
create index jarvis_reminder_owner_due on public.jarvis_reminders(owner_id,due_at);
create table public.jarvis_notifications (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 dedup_key text not null, title text not null, body text not null, created_at timestamptz not null default now(),
 reminder_id uuid references public.jarvis_reminders(id) on delete cascade, source_version text,
 acknowledged_at timestamptz, snoozed_until timestamptz, delivered_at timestamptz,
 push_sent_at timestamptz, push_lease_until timestamptz, push_lease_token uuid, push_attempts integer not null default 0, push_error text,
 unique(owner_id,dedup_key)
);
create index jarvis_notification_owner_created on public.jarvis_notifications(owner_id,created_at desc);
create table public.jarvis_push_subscriptions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null, keys jsonb not null, created_at timestamptz not null default now(), unique(owner_id,endpoint)
);
do $$ declare t text; begin
 foreach t in array array['jarvis_activity_preferences','jarvis_background_jobs','jarvis_reminders','jarvis_notifications','jarvis_push_subscriptions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role=''owner''))',t);
 end loop;
end $$;
grant select on public.jarvis_activity_preferences,public.jarvis_background_jobs,public.jarvis_reminders,public.jarvis_notifications,public.jarvis_push_subscriptions to authenticated;
grant insert(owner_id,background_enabled,reminders_enabled,speech_enabled,push_enabled,prep_minutes,travel_minutes,timezone,quiet_start,quiet_end), update(background_enabled,reminders_enabled,speech_enabled,push_enabled,prep_minutes,travel_minutes,timezone,quiet_start,quiet_end) on public.jarvis_activity_preferences to authenticated;
create policy owner_insert on public.jarvis_activity_preferences for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner'));
create policy owner_update on public.jarvis_activity_preferences for update to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner')) with check(owner_id=(select auth.uid()));
grant insert(owner_id,kind) on public.jarvis_background_jobs to authenticated;
create policy owner_enqueue on public.jarvis_background_jobs for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner') and exists(select 1 from public.jarvis_activity_preferences where owner_id=(select auth.uid()) and background_enabled));
create function public.jarvis_enqueue_review(p_kind text) returns public.jarvis_background_jobs language plpgsql security invoker set search_path='' as $$
declare job public.jarvis_background_jobs; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.jarvis_background_jobs where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Review limit reached; try later'; end if;
 if exists(select 1 from public.jarvis_background_jobs where owner_id=auth.uid() and kind=p_kind and status in ('queued','running')) then raise exception 'This review is already queued or running'; end if;
 insert into public.jarvis_background_jobs(owner_id,kind) values(auth.uid(),p_kind) returning * into job;
 return job; end $$;
revoke all on function public.jarvis_enqueue_review(text) from public,anon;
grant execute on function public.jarvis_enqueue_review(text) to authenticated;
-- Invoker runs as the secret-authenticated service role. SKIP LOCKED + token CAS
-- ensures concurrent workers and stale workers cannot publish two results.
create function public.jarvis_claim_review(p_token uuid) returns setof public.jarvis_background_jobs language sql security invoker set search_path='' as $$
 with candidate as (select id from public.jarvis_background_jobs where status='queued' or (status='running' and lease_until<now()) order by created_at for update skip locked limit 1)
 update public.jarvis_background_jobs j set status='running',lease_token=p_token,lease_until=now()+interval '120 seconds',started_at=coalesce(started_at,now()),attempts=attempts+1 from candidate c where j.id=c.id returning j.*;
$$;
create function public.jarvis_finish_review(p_id uuid,p_token uuid,p_result jsonb,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.jarvis_background_jobs; begin
 update public.jarvis_background_jobs set status=case when p_error is null then 'completed' else 'failed' end,result=p_result,error=p_error,finished_at=now(),lease_until=null,lease_token=null
 where id=p_id and lease_token=p_token and status='running' and lease_until>now() returning * into job;
 if job.id is null then return false; end if;
 insert into public.jarvis_notifications(owner_id,dedup_key,title,body) values(job.owner_id,'job:'||job.id,case when p_error is null then 'Review ready' else 'Review failed' end,case when p_error is null then coalesce(p_result->>'summary','Read-only review complete.') else p_error end) on conflict(owner_id,dedup_key) do nothing;
 return true; end $$;
revoke all on function public.jarvis_claim_review(uuid),public.jarvis_finish_review(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.jarvis_claim_review(uuid),public.jarvis_finish_review(uuid,uuid,jsonb,text) to service_role;
grant update(acknowledged_at,snoozed_until) on public.jarvis_reminders to authenticated;
grant update(acknowledged_at,snoozed_until,delivered_at) on public.jarvis_notifications to authenticated;
create policy owner_update on public.jarvis_reminders for update to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner')) with check(owner_id=(select auth.uid()));
create policy owner_update on public.jarvis_notifications for update to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner')) with check(owner_id=(select auth.uid()));
grant insert(owner_id,endpoint,keys),update(keys),delete on public.jarvis_push_subscriptions to authenticated;
create policy owner_insert on public.jarvis_push_subscriptions for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner'));
create policy owner_update on public.jarvis_push_subscriptions for update to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner')) with check(owner_id=(select auth.uid()));
create policy owner_delete on public.jarvis_push_subscriptions for delete to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner'));
create function public.jarvis_sync_reminder(p_owner uuid,p_source_id text,p_version text,p_title text,p_body text,p_start timestamptz,p_due timestamptz) returns uuid language sql security invoker set search_path='' as $$
 insert into public.jarvis_reminders(owner_id,source_id,source_version,title,body,starts_at,due_at) values(p_owner,p_source_id,p_version,p_title,p_body,p_start,p_due)
 on conflict(owner_id,source_id) do update set source_version=excluded.source_version,title=excluded.title,body=excluded.body,starts_at=excluded.starts_at,due_at=excluded.due_at,
 acknowledged_at=case when public.jarvis_reminders.source_version=excluded.source_version then public.jarvis_reminders.acknowledged_at else null end,
 snoozed_until=case when public.jarvis_reminders.source_version=excluded.source_version then public.jarvis_reminders.snoozed_until else null end returning id;
$$;
revoke all on function public.jarvis_sync_reminder(uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.jarvis_sync_reminder(uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
create function public.jarvis_claim_notice(p_id uuid) returns setof public.jarvis_notifications language sql security invoker set search_path='' as $$
 update public.jarvis_notifications set delivered_at=now() where id=p_id and owner_id=auth.uid() and delivered_at is null and acknowledged_at is null and (snoozed_until is null or snoozed_until<=now()) and (reminder_id is null or exists(select 1 from public.jarvis_reminders r join public.jarvis_activity_preferences p on p.owner_id=r.owner_id where r.id=public.jarvis_notifications.reminder_id and r.source_version=public.jarvis_notifications.source_version and r.starts_at>now() and p.reminders_enabled and p.last_worker_error is null and p.last_checked_at>now()-interval '3 minutes')) returning *;
$$;
revoke all on function public.jarvis_claim_notice(uuid) from public,anon;
grant execute on function public.jarvis_claim_notice(uuid) to authenticated;
alter table public.jarvis_activity_preferences add column worker_lease_until timestamptz, add column worker_lease_token uuid;
-- Reconcile each owner/source batch atomically. Hard cap refuses partial scans.
create function public.jarvis_sync_reminders(p_owner uuid,p_events jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare e jsonb; begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>100 then raise exception 'Reminder batch exceeds safe limit'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
 perform public.jarvis_sync_reminder(p_owner,e->>'source_id',e->>'source_version',e->>'title',e->>'body',(e->>'starts_at')::timestamptz,(e->>'due_at')::timestamptz);
 end loop;
 delete from public.jarvis_notifications n using public.jarvis_reminders r where n.owner_id=p_owner and r.owner_id=p_owner and n.reminder_id=r.id and n.source_version<>r.source_version;
 delete from public.jarvis_reminders where owner_id=p_owner and not exists(select 1 from jsonb_array_elements(p_events) event where event->>'source_id'=public.jarvis_reminders.source_id);
 end $$;
revoke all on function public.jarvis_sync_reminders(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.jarvis_sync_reminders(uuid,jsonb) to service_role;
-- Enforce the same queue limits for direct authenticated Data API inserts.
create function public.jarvis_guard_review_insert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 if (select count(*) from public.jarvis_background_jobs where owner_id=new.owner_id and created_at>now()-interval '1 hour')>=10 then raise exception 'Review limit reached; try later'; end if;
 if exists(select 1 from public.jarvis_background_jobs where owner_id=new.owner_id and kind=new.kind and status in ('queued','running')) then raise exception 'This review is already queued or running'; end if;
 return new;
end $$;
revoke all on function public.jarvis_guard_review_insert() from public,anon,authenticated;
create trigger jarvis_review_insert_guard before insert on public.jarvis_background_jobs for each row execute function public.jarvis_guard_review_insert();
