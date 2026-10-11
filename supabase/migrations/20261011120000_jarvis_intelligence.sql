-- Read-only intelligence projection. Source-business tables are never written.
create table public.jarvis_intelligence_settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 hourly_target numeric not null default 130 check(hourly_target between 1 and 10000),
 interests jsonb not null default '["WeedEater operating improvements","Local service demand","AI and automation","Cross-industry low-capital opportunities"]',
 watches jsonb not null default '[]',
 research_automation_id text, research_cadence text,
 lease_token uuid, lease_until timestamptz, lease_started_at timestamptz,
 last_internal_started_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.jarvis_intelligence_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('internal','external')), run_key text not null,
 started_at timestamptz not null, finished_at timestamptz not null,
 status text not null check(status in ('completed','partial','failed')),
 summary text not null, coverage jsonb not null, item_count integer not null, applied boolean not null,
 unique(owner_id,source,run_key)
);
create index jarvis_intelligence_runs_owner on public.jarvis_intelligence_runs(owner_id,source,started_at desc);
create table public.jarvis_intelligence_items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('internal','external')), dedup_key text not null,
 payload jsonb not null, observed_at timestamptz not null,
 source_active boolean not null default true,
 state text not null default 'new' check(state in ('new','accepted','watch','dismissed','completed')),
 outcome jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,source,dedup_key)
);
create index jarvis_intelligence_items_owner on public.jarvis_intelligence_items(owner_id,state,updated_at desc);
do $$ declare t text; begin
 foreach t in array array['jarvis_intelligence_settings','jarvis_intelligence_runs','jarvis_intelligence_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role=''owner''))',t);
 end loop;
end $$;
-- Small validation primitives, shared by authenticated decisions and service ingestion.
create function public.jarvis_intelligence_shape(v jsonb,keys text[]) returns boolean language plpgsql immutable set search_path='' as $$ begin
 if v is null or jsonb_typeof(v)<>'object' then return false; end if;
 return v ?& keys and not exists(select 1 from jsonb_object_keys(v) k where not k=any(keys));
end $$;
create function public.jarvis_intelligence_text(v jsonb,max_length integer,allow_empty boolean default false) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and length(v#>>'{}')<=max_length and (allow_empty or length(btrim(v#>>'{}'))>0),false);
$$;
create function public.jarvis_intelligence_number(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$ begin
 if v='null'::jsonb then return true; end if;
 if v is null or jsonb_typeof(v)<>'number' then return false; end if;
 return (v#>>'{}')::numeric between 0 and 1000000000;
end $$;
create function public.jarvis_intelligence_time(v jsonb,nullable boolean default false) returns boolean language plpgsql immutable set search_path='' as $$ begin
 if nullable and v='null'::jsonb then return true; end if;
 if not public.jarvis_intelligence_text(v,40) or v#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
 return isfinite((v#>>'{}')::timestamptz);
end $$;
create function public.jarvis_intelligence_url(v text,src text) returns boolean language plpgsql immutable set search_path='' as $$ declare host text; begin
 if v is null or length(v)>2048 or v ~ '[[:space:]\\]' then return false; end if;
 if src='internal' then return v ~ '^/(invoices|quotes|jobs)/[0-9a-f-]{36}$' or v='/connections'; end if;
 if v !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+([/?#]|$)' then return false; end if;
 host=lower(substring(v from '^https://([^/?#]+)'));
 return host ~ '\.[a-z]{2,}$' and host !~ '(^|\.)(localhost|local|internal|test|invalid|example|home|lan)$';
end $$;
create function public.jarvis_claim_intelligence(p_owner uuid,p_token uuid,p_force boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.jarvis_intelligence_settings; stamp timestamptz=clock_timestamp(); begin
 if not exists(select 1 from public.app_members where user_id=p_owner and active and role='owner') then raise exception 'Active owner required'; end if;
 if p_token is null then raise exception 'Lease token required'; end if;
 insert into public.jarvis_intelligence_settings(owner_id) values(p_owner) on conflict do nothing;
 select * into s from public.jarvis_intelligence_settings where owner_id=p_owner for update;
 if not s.enabled then return jsonb_build_object('claimed',false,'reason','disabled'); end if;
 if s.lease_until>stamp then return jsonb_build_object('claimed',false,'reason','running'); end if;
 if s.last_internal_started_at>stamp-(case when p_force then interval '1 minute' else interval '15 minutes' end) then return jsonb_build_object('claimed',false,'reason','recent'); end if;
 update public.jarvis_intelligence_settings set lease_token=p_token,lease_until=stamp+interval '120 seconds',lease_started_at=stamp,last_internal_started_at=stamp where owner_id=p_owner;
 return jsonb_build_object('claimed',true,'started_at',stamp,'lease_token',p_token);
end $$;
create function public.jarvis_import_intelligence(p_owner uuid,p_run jsonb,p_items jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.jarvis_intelligence_settings; previous public.jarvis_intelligence_runs; r public.jarvis_intelligence_runs;
 src text; started timestamptz; finished timestamptz; newest timestamptz; apply_run boolean; item jsonb; e jsonb; c jsonb; k text; num integer; scope text;
 required text[]=array['dedup_key','scope','title','why_now','next_step','owner_label','confidence','priority','priority_basis','impact','effort_hours','capital_required','facts','inference','evidence','deadline','expires_at','prepared','validation'];
 begin
 if not exists(select 1 from public.app_members where user_id=p_owner and active and role='owner') then raise exception 'Active owner required'; end if;
 insert into public.jarvis_intelligence_settings(owner_id) values(p_owner) on conflict do nothing;
 select * into s from public.jarvis_intelligence_settings where owner_id=p_owner for update;
 if not s.enabled then raise exception 'Intelligence is disabled'; end if;
 src=p_run->>'source';
 if src not in ('internal','external') or src is null or not public.jarvis_intelligence_shape(p_run,case when src='internal' then array['source','run_key','started_at','finished_at','status','summary','coverage','lease_token'] else array['source','run_key','started_at','finished_at','status','summary','coverage'] end) then raise exception 'Invalid run shape'; end if;
 if not public.jarvis_intelligence_text(p_run->'run_key',160) then raise exception 'Invalid run key'; end if;
 select * into previous from public.jarvis_intelligence_runs where owner_id=p_owner and source=src and run_key=p_run->>'run_key';
 if previous.id is not null then return jsonb_build_object('run_id',previous.id,'item_count',previous.item_count,'applied',previous.applied,'duplicate',true); end if;
 if jsonb_typeof(p_items) is distinct from 'array' or octet_length(p_items::text)>(case when src='external' then 102400 else 1048576 end) or octet_length(p_run::text)>16384 then raise exception 'Import exceeds safe bounds'; end if;
 num=jsonb_array_length(p_items);
 if num>(case when src='external' then 3 else 100 end) then raise exception 'Too many findings'; end if;
 if not public.jarvis_intelligence_text(p_run->'status',20) or not public.jarvis_intelligence_text(p_run->'summary',2000) or p_run->>'status' not in ('completed','partial','failed') then raise exception 'Invalid run status or summary'; end if;
 if not public.jarvis_intelligence_time(p_run->'started_at') or not public.jarvis_intelligence_time(p_run->'finished_at') then raise exception 'ISO run timestamps required'; end if;
 started=(p_run->>'started_at')::timestamptz; finished=(p_run->>'finished_at')::timestamptz;
 if started is null or finished is null or not isfinite(started) or not isfinite(finished) or started<clock_timestamp()-interval '24 hours' or finished<started or finished>clock_timestamp()+interval '5 minutes' then raise exception 'Invalid or stale run timestamps'; end if;
 if src='internal' and (s.lease_token is null or s.lease_until is null or p_run->>'lease_token' is null or s.lease_token is distinct from (p_run->>'lease_token')::uuid or s.lease_until<=clock_timestamp() or s.lease_started_at is distinct from started or p_run->>'run_key'<>'internal:'||(p_run->>'lease_token')) then raise exception 'Scan lease is not current'; end if;
 if jsonb_typeof(p_run->'coverage') is distinct from 'array' or jsonb_array_length(p_run->'coverage') not between 1 and 6 then raise exception 'Invalid source coverage'; end if;
 if src='external' and (jsonb_array_length(p_run->'coverage')<>1 or p_run->'coverage'->0->>'source'<>'research') then raise exception 'External research coverage required'; end if;
 if src='internal' and (jsonb_array_length(p_run->'coverage')<>5 or not (p_run->'coverage' @> '[{"source":"invoices"},{"source":"quotes"},{"source":"jobs"},{"source":"homeworks"},{"source":"quickbooks"}]')) then raise exception 'Internal coverage must name all five sources'; end if;
 if (select count(distinct value->>'source') from jsonb_array_elements(p_run->'coverage'))<>jsonb_array_length(p_run->'coverage') then raise exception 'Duplicate coverage source'; end if;
 for c in select value from jsonb_array_elements(p_run->'coverage') loop
 if not public.jarvis_intelligence_text(c->'source',20) or not public.jarvis_intelligence_text(c->'status',20) or not public.jarvis_intelligence_shape(c,array['source','status','checked_at','detail','records']) or c->>'source' not in ('invoices','quotes','jobs','homeworks','quickbooks','research') or c->>'status' not in ('ok','failed','unverified') or not public.jarvis_intelligence_text(c->'detail',2000) or not public.jarvis_intelligence_number(c->'records') then raise exception 'Invalid source coverage entry'; end if;
 if not public.jarvis_intelligence_time(c->'checked_at') then raise exception 'ISO coverage time required'; end if;
 if (c->>'checked_at')::timestamptz<started-interval '5 minutes' or (c->>'checked_at')::timestamptz>finished+interval '5 minutes' or c->>'checked_at' is null then raise exception 'Invalid coverage time'; end if;
 if c->>'status'<>'ok' and c->'records'<>'null'::jsonb then raise exception 'Unknown source counts must remain null'; end if;
 if c->'records'<>'null'::jsonb and (c->>'records')::numeric<>trunc((c->>'records')::numeric) then raise exception 'Source count must be an integer'; end if;
 end loop;
 if p_run->>'status'='failed' and (num>0 or not exists(select 1 from jsonb_array_elements(p_run->'coverage') cv where cv->>'status'='failed')) then raise exception 'Failed run requires failed coverage and zero findings'; end if;
 if p_run->>'status'='completed' and exists(select 1 from jsonb_array_elements(p_run->'coverage') cv where cv->>'source'<>'quickbooks' and cv->>'status'<>'ok') then raise exception 'Completed run has source gaps'; end if;
 if (select count(distinct value->>'dedup_key') from jsonb_array_elements(p_items))<>num then raise exception 'Duplicate finding key'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
 if not public.jarvis_intelligence_shape(item,required) then raise exception 'Invalid finding shape'; end if;
 scope=item->>'scope';
 if (src='external' and scope<>'research') or (src='internal' and scope not in ('invoices','quotes','jobs')) or scope is null then raise exception 'Invalid finding scope'; end if;
 if not exists(select 1 from jsonb_array_elements(p_run->'coverage') cv where cv->>'source'=scope and cv->>'status'='ok') then raise exception 'Finding source was not successfully read'; end if;
 if not public.jarvis_intelligence_text(item->'dedup_key',160) or item->>'dedup_key' !~ '^[A-Za-z0-9:._/-]+$' then raise exception 'Invalid finding key'; end if;
 foreach k in array array['title','why_now','next_step','owner_label','priority_basis','inference'] loop
 if not public.jarvis_intelligence_text(item->k,case k when 'title' then 160 when 'owner_label' then 120 when 'priority_basis' then 1000 else 2000 end) then raise exception 'Invalid finding text: %',k; end if;
 end loop;
 if not public.jarvis_intelligence_text(item->'confidence',20) or item->>'confidence' not in ('low','medium','high') or jsonb_typeof(item->'priority')<>'number' or (item->>'priority')::numeric not between 0 and 100 or (item->>'priority')::numeric<>trunc((item->>'priority')::numeric) then raise exception 'Invalid rank'; end if;
 if not public.jarvis_intelligence_number(item->'effort_hours') or not public.jarvis_intelligence_number(item->'capital_required') then raise exception 'Invalid effort or capital'; end if;
 e=item->'impact';
 if not public.jarvis_intelligence_text(e->'kind',30) or not public.jarvis_intelligence_shape(e,array['kind','amount','unit','basis']) or e->>'kind' not in ('receivable_balance','quoted_revenue','planned_rate','scenario','unknown') or not public.jarvis_intelligence_number(e->'amount') or not public.jarvis_intelligence_text(e->'basis',2000) then raise exception 'Invalid impact'; end if;
 if (e->'amount'='null'::jsonb)<>(e->'unit'='null'::jsonb) or (e->'unit'<>'null'::jsonb and e->>'unit' not in ('USD','USD/hour')) or (e->>'kind'='unknown' and e->'amount'<>'null'::jsonb) or (src='external' and e->>'kind' not in ('scenario','unknown')) then raise exception 'Invalid impact units or claim'; end if;
 if jsonb_typeof(item->'facts')<>'array' or jsonb_array_length(item->'facts') not between 1 and 12 then raise exception 'Invalid facts'; end if;
 for e in select value from jsonb_array_elements(item->'facts') loop if not public.jarvis_intelligence_text(e,1000) then raise exception 'Invalid fact'; end if; end loop;
 if not public.jarvis_intelligence_time(item->'expires_at') or not public.jarvis_intelligence_time(item->'deadline',true) then raise exception 'ISO expiry/deadline required'; end if;
 if (item->>'expires_at')::timestamptz<=finished or (item->>'expires_at')::timestamptz>finished+interval '30 days' or item->>'expires_at' is null then raise exception 'Invalid expiry'; end if;
 if item->'deadline'<>'null'::jsonb and ((item->>'deadline')::timestamptz<=finished or not isfinite((item->>'deadline')::timestamptz)) then raise exception 'Expired deadline'; end if;
 if jsonb_typeof(item->'evidence')<>'array' or jsonb_array_length(item->'evidence') not between 1 and 8 then raise exception 'Evidence required'; end if;
 for e in select value from jsonb_array_elements(item->'evidence') loop
 if not public.jarvis_intelligence_text(e->'source_type',20) or not public.jarvis_intelligence_shape(e,array['title','url','observed_at','published_at','source_type','note']) or not public.jarvis_intelligence_text(e->'title',240) or not public.jarvis_intelligence_text(e->'note',2000) or not public.jarvis_intelligence_url(e->>'url',src) or e->>'source_type'<>(case when src='external' then 'primary' else 'record' end) then raise exception 'Unsafe or unsupported evidence'; end if;
 if not public.jarvis_intelligence_time(e->'observed_at') or not public.jarvis_intelligence_time(e->'published_at',true) then raise exception 'ISO evidence time required'; end if;
 if (e->>'observed_at')::timestamptz<finished-interval '14 days' or (e->>'observed_at')::timestamptz>finished+interval '5 minutes' or e->>'observed_at' is null then raise exception 'Stale evidence'; end if;
 if e->'published_at'<>'null'::jsonb and ((e->>'published_at')::timestamptz>finished+interval '5 minutes' or not isfinite((e->>'published_at')::timestamptz)) then raise exception 'Invalid publication time'; end if;
 end loop;
 e=item->'prepared';
 if not public.jarvis_intelligence_text(e->'kind',30) or not public.jarvis_intelligence_shape(e,array['kind','content','prepared_at','next_actor']) or e->>'kind' not in ('collection_draft','quote_draft','calculation','worksheet','experiment','comparison','outreach_draft') or not public.jarvis_intelligence_text(e->'content',12000) or not public.jarvis_intelligence_text(e->'next_actor',120) then raise exception 'Prepared work required'; end if;
 if src='external' and e->>'kind' not in ('experiment','comparison','outreach_draft') then raise exception 'External prepared work must be an experiment, comparison or outreach draft'; end if;
 if not public.jarvis_intelligence_time(e->'prepared_at') then raise exception 'ISO preparation time required'; end if;
 if (e->>'prepared_at')::timestamptz<started-interval '5 minutes' or (e->>'prepared_at')::timestamptz>finished+interval '5 minutes' or e->>'prepared_at' is null then raise exception 'Invalid preparation time'; end if;
 e=item->'validation';
 if src='external' or e<>'null'::jsonb then
 if not public.jarvis_intelligence_shape(e,array['mechanism','fit','entry_barrier','cheapest_test','success_metric','stop_rule']) then raise exception 'External validation criteria required'; end if;
 foreach k in array array['mechanism','fit','entry_barrier','cheapest_test','success_metric','stop_rule'] loop if not public.jarvis_intelligence_text(e->k,2000) then raise exception 'Invalid validation criterion'; end if; end loop;
 end if;
 end loop;
 select max(started_at) into newest from public.jarvis_intelligence_runs where owner_id=p_owner and source=src and applied;
 apply_run=newest is null or started>newest;
 insert into public.jarvis_intelligence_runs(owner_id,source,run_key,started_at,finished_at,status,summary,coverage,item_count,applied) values(p_owner,src,p_run->>'run_key',started,finished,p_run->>'status',p_run->>'summary',p_run->'coverage',num,apply_run) returning * into r;
 if apply_run and r.status<>'failed' then
 for item in select value from jsonb_array_elements(p_items) loop
 insert into public.jarvis_intelligence_items(owner_id,source,dedup_key,payload,observed_at) values(p_owner,src,item->>'dedup_key',item,started)
 on conflict(owner_id,source,dedup_key) do update set payload=excluded.payload,observed_at=excluded.observed_at,source_active=true,updated_at=clock_timestamp()
 where public.jarvis_intelligence_items.observed_at<excluded.observed_at;
 end loop;
 if src='internal' then
 update public.jarvis_intelligence_items i set source_active=false,updated_at=clock_timestamp() where i.owner_id=p_owner and i.source='internal' and i.source_active and exists(select 1 from jsonb_array_elements(p_run->'coverage') cv where cv->>'source'=i.payload->>'scope' and cv->>'status'='ok') and not exists(select 1 from jsonb_array_elements(p_items) x where x->>'dedup_key'=i.dedup_key);
 end if;
 end if;
 if src='internal' then update public.jarvis_intelligence_settings set lease_token=null,lease_until=null where owner_id=p_owner and lease_token=(p_run->>'lease_token')::uuid; end if;
 return jsonb_build_object('run_id',r.id,'item_count',num,'applied',apply_run,'duplicate',false);
end $$;
-- Authenticated mutation boundary. No authenticated table writes, including facts/outcomes.
create function public.jarvis_update_intelligence(p_action jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid=auth.uid(); act text=p_action->>'action'; item public.jarvis_intelligence_items; k text; list jsonb; v jsonb; begin
 if owner is null or not exists(select 1 from public.app_members where user_id=owner and active and role='owner') then raise exception 'Active owner required'; end if;
 if octet_length(p_action::text)>16384 then raise exception 'Action exceeds safe limit'; end if;
 if act='preferences' then
 if not public.jarvis_intelligence_shape(p_action,array['action','enabled','hourly_target','interests','watches']) or jsonb_typeof(p_action->'enabled')<>'boolean' or jsonb_typeof(p_action->'hourly_target')<>'number' or (p_action->>'hourly_target')::numeric not between 1 and 10000 then raise exception 'Invalid preferences'; end if;
 foreach k in array array['interests','watches'] loop
 list=p_action->k;
 if jsonb_typeof(list)<>'array' or jsonb_array_length(list)>12 then raise exception 'Invalid interests or watches'; end if;
 for v in select value from jsonb_array_elements(list) loop if not public.jarvis_intelligence_text(v,120) then raise exception 'Invalid interest or watch'; end if; end loop;
 end loop;
 insert into public.jarvis_intelligence_settings(owner_id,enabled,hourly_target,interests,watches) values(owner,(p_action->>'enabled')::boolean,(p_action->>'hourly_target')::numeric,p_action->'interests',p_action->'watches') on conflict(owner_id) do update set enabled=excluded.enabled,hourly_target=excluded.hourly_target,interests=excluded.interests,watches=excluded.watches,updated_at=clock_timestamp();
 elsif act in ('decision','outcome') then
 select * into item from public.jarvis_intelligence_items where id=(p_action->>'id')::uuid and owner_id=owner for update;
 if item.id is null then raise exception 'Item unavailable'; end if;
 if act='decision' then
 if not public.jarvis_intelligence_shape(p_action,array['action','id','state']) or p_action->>'state' not in ('accepted','watch','dismissed','completed') then raise exception 'Invalid decision'; end if;
 if item.state in ('dismissed','completed') and p_action->>'state' not in (item.state,'watch') then raise exception 'Return terminal items to watch before accepting'; end if;
 update public.jarvis_intelligence_items set state=p_action->>'state',updated_at=clock_timestamp() where id=item.id;
 else
 if not public.jarvis_intelligence_shape(p_action,array['action','id','notes','realized_revenue','realized_savings','hours_saved']) or not public.jarvis_intelligence_text(p_action->'notes',2000,true) then raise exception 'Invalid outcome'; end if;
 foreach k in array array['realized_revenue','realized_savings','hours_saved'] loop if not public.jarvis_intelligence_number(p_action->k) then raise exception 'Invalid outcome amount'; end if; end loop;
 update public.jarvis_intelligence_items set outcome=(p_action-'action'-'id')||jsonb_build_object('recorded_at',clock_timestamp(),'attribution','owner_reported'),updated_at=clock_timestamp() where id=item.id;
 end if;
 else raise exception 'Unsupported action'; end if;
 return true;
end $$;
revoke all on function public.jarvis_claim_intelligence(uuid,uuid,boolean),public.jarvis_import_intelligence(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.jarvis_claim_intelligence(uuid,uuid,boolean),public.jarvis_import_intelligence(uuid,jsonb,jsonb) to service_role;
revoke all on function public.jarvis_update_intelligence(jsonb) from public,anon;
grant execute on function public.jarvis_update_intelligence(jsonb) to authenticated;
revoke all on function public.jarvis_intelligence_shape(jsonb,text[]),public.jarvis_intelligence_text(jsonb,integer,boolean),public.jarvis_intelligence_number(jsonb),public.jarvis_intelligence_time(jsonb,boolean),public.jarvis_intelligence_url(text,text) from public,anon,authenticated;
grant execute on function public.jarvis_intelligence_shape(jsonb,text[]),public.jarvis_intelligence_text(jsonb,integer,boolean),public.jarvis_intelligence_number(jsonb),public.jarvis_intelligence_time(jsonb,boolean),public.jarvis_intelligence_url(text,text) to service_role;

-- Keep the top-decision window independent of Watch/history volume. Freshness,
-- numeric rank and category diversity are applied before the fixed read bound.
-- SECURITY INVOKER and explicit auth.uid() retain active-owner RLS isolation.
create function public.jarvis_intelligence_candidates() returns setof public.jarvis_intelligence_items
language sql security invoker set search_path='' as $$
 with latest as (
  select distinct on (source) source,status,finished_at,coverage
  from public.jarvis_intelligence_runs
  where owner_id=auth.uid() and applied
  order by source,started_at desc
 ), ranked as (
  select i.id,row_number() over (
   partition by case when i.source='internal' and i.payload->>'scope'<>'jobs' then i.payload->>'scope' else i.dedup_key end
   order by (i.payload->>'priority')::numeric desc,i.dedup_key
  ) category_rank
  from public.jarvis_intelligence_items i
  join public.jarvis_intelligence_settings s on s.owner_id=i.owner_id and s.enabled
  join latest r on r.source=i.source
  where i.owner_id=auth.uid() and i.source_active and i.state in ('new','accepted')
   and (i.payload->>'expires_at')::timestamptz>statement_timestamp()
   and (i.payload->>'deadline' is null or (i.payload->>'deadline')::timestamptz>=statement_timestamp())
   and r.status<>'failed'
   and r.finished_at>=statement_timestamp()-(case when i.source='internal' then interval '45 minutes' else interval '150 minutes' end)
   and r.coverage @> jsonb_build_array(jsonb_build_object('source',i.payload->>'scope','status','ok'))
   and (i.source<>'internal' or r.coverage @> '[{"source":"homeworks","status":"ok"}]')
   and jsonb_array_length(i.payload->'evidence')>0
   and not exists(select 1 from jsonb_array_elements(i.payload->'evidence') e where (e->>'observed_at')::timestamptz<statement_timestamp()-interval '14 days')
 )
 select i.* from ranked c join public.jarvis_intelligence_items i on i.id=c.id
 where c.category_rank=1
 order by (i.payload->>'priority')::numeric desc,i.dedup_key
 limit 101;
$$;
revoke all on function public.jarvis_intelligence_candidates() from public,anon;
grant execute on function public.jarvis_intelligence_candidates() to authenticated;
