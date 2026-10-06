-- Homeworks source mirror and resumable production sync. No business rows are deleted.
create table public.homeworks_leases(name text primary key, owner uuid not null, expires_at timestamptz not null);
create table public.homeworks_sync_state(stream text primary key, cursor jsonb, last_success_at timestamptz, last_full_at timestamptz, last_error text, failure_count integer not null default 0, updated_at timestamptz not null default now());
create table public.homeworks_sync_runs(id uuid primary key, started_at timestamptz not null default now(), completed_at timestamptz, status text not null default 'running', records integer not null default 0, error text);
create table public.homeworks_records(entity text not null, homeworks_id text not null, payload jsonb not null, source_updated_at timestamptz, changed_at timestamptz not null default now(), projected_id uuid, primary key(entity,homeworks_id));

alter table public.homeworks_leases enable row level security;
alter table public.homeworks_sync_state enable row level security;
alter table public.homeworks_sync_runs enable row level security;
alter table public.homeworks_records enable row level security;
revoke all on public.homeworks_leases,public.homeworks_sync_state,public.homeworks_sync_runs,public.homeworks_records from anon,authenticated;
grant all on public.homeworks_leases,public.homeworks_sync_state,public.homeworks_sync_runs,public.homeworks_records to service_role;
grant select on public.homeworks_sync_state,public.homeworks_sync_runs,public.homeworks_records to authenticated;
create policy owner_read on public.homeworks_sync_state for select to authenticated using (exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner'));
create policy owner_read on public.homeworks_sync_runs for select to authenticated using (exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner'));
create policy owner_read on public.homeworks_records for select to authenticated using (exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner'));

do $$ declare t text; begin
 foreach t in array array['clients','properties','jobs','invoices','quotes','payments','services','employees'] loop
 execute format('alter table public.%I add column if not exists homeworks_id text',t);
 execute format('alter table public.%I add column if not exists homeworks_status text',t);
 execute format('alter table public.%I add column if not exists homeworks_deleted boolean not null default false',t);
 execute format('alter table public.%I add column if not exists homeworks_notes text',t);
 execute format('create unique index if not exists %I on public.%I(homeworks_id)',t||'_homeworks_id_key',t);
 end loop;
end $$;

create function public.homeworks_claim_lease(p_name text,p_owner uuid,p_seconds integer) returns boolean language sql security invoker set search_path='' as $$
 with claimed as (insert into public.homeworks_leases(name,owner,expires_at) values(p_name,p_owner,clock_timestamp()+make_interval(secs=>least(p_seconds,300))) on conflict(name) do update set owner=excluded.owner,expires_at=excluded.expires_at where public.homeworks_leases.expires_at<clock_timestamp() returning 1) select exists(select 1 from claimed);
$$;
create function public.homeworks_release_lease(p_name text,p_owner uuid) returns void language sql security invoker set search_path='' as $$ delete from public.homeworks_leases where name=p_name and owner=p_owner $$;
revoke all on function public.homeworks_claim_lease(text,uuid,integer),public.homeworks_release_lease(text,uuid) from public,anon,authenticated;
grant execute on function public.homeworks_claim_lease(text,uuid,integer),public.homeworks_release_lease(text,uuid) to service_role;

-- Atomically apply a page AND its cursor. A crash can only replay an entire safe page.
create function public.homeworks_apply_page(p_owner uuid,p_stream text,p_entity text,p_rows jsonb,p_cursor jsonb,p_complete boolean default false) returns integer
language plpgsql security invoker set search_path='' as $$
declare r jsonb; old jsonb; hid text; cid uuid; pid uuid; rid uuid; sid uuid; eid uuid; deleted boolean; st text; changed integer:=0; source_time timestamptz; prev_time timestamptz; member jsonb; prior_member jsonb;
begin
 if not exists(select 1 from public.homeworks_leases where name='sync' and owner=p_owner and expires_at>clock_timestamp()) then raise exception 'Sync lease expired'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  hid:=r->>'id'; if hid is null then raise exception 'Source ID required'; end if;
  source_time:=nullif(r->>'updatedAt','')::timestamptz;
  old:=null; prev_time:=null; rid:=null; cid:=null; pid:=null; sid:=null;
  select payload,source_updated_at,projected_id into old,prev_time,rid from public.homeworks_records where entity=p_entity and homeworks_id=hid for update;
  if old=r or (prev_time is not null and source_time is not null and prev_time>source_time) then continue; end if;
  deleted:=coalesce((r->>'__deleted')::boolean,false) or coalesce((r->>'isDeleted')::boolean,false) or coalesce(r->>'deletedState','ACTIVE')<>'ACTIVE' or coalesce(r->>'deletedStatus','ACTIVE')='DELETED';
  st:=r->>'status';
  if p_entity='customers' then
   insert into public.clients(homeworks_id,first_name,last_name,email,phone,status,data_source,homeworks_status,homeworks_deleted,homeworks_notes)
   values(hid,r->>'firstName',r->>'lastName',r->>'email',coalesce(nullif(r->>'cell',''),r->>'phone'),case when deleted or st='INACTIVE' then 'inactive' else 'active' end,'homeworks_sync',st,deleted,r->>'description')
   on conflict(homeworks_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=excluded.phone,status=excluded.status,data_source=excluded.data_source,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted,homeworks_notes=excluded.homeworks_notes returning id into rid;
  elsif p_entity='properties' then
   select id into cid from public.clients where homeworks_id=r->>'customerId';
   if cid is null then raise exception 'Missing customer % for property %',r->>'customerId',hid; end if;
   insert into public.properties(homeworks_id,client_id,property_name,street,city,state,zip,active,homeworks_status,homeworks_deleted,homeworks_notes)
   values(hid,cid,r->>'name',concat_ws(' ',nullif(r#>>'{address,street1}',''),nullif(r#>>'{address,street2}','')),r#>>'{address,city}',r#>>'{address,state}',r#>>'{address,zip}',not deleted and coalesce((r->>'isActive')::boolean,false),r->>'deletedStatus',deleted,r->>'notes')
   on conflict(homeworks_id) do update set client_id=excluded.client_id,property_name=excluded.property_name,street=excluded.street,city=excluded.city,state=excluded.state,zip=excluded.zip,active=excluded.active,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted,homeworks_notes=excluded.homeworks_notes returning id into rid;
  elsif p_entity='items' then
   -- Link an unambiguous existing service by exact name once; never fuzzy-match.
   if (select count(*) from public.services where homeworks_id is null and lower(name)=lower(r->>'name'))=1 and not exists(select 1 from public.services where homeworks_id=hid) then
    update public.services set homeworks_id=hid where homeworks_id is null and lower(name)=lower(r->>'name');
   end if;
   insert into public.services(homeworks_id,name,description,default_price,default_budgeted_hours,active,homeworks_status,homeworks_deleted)
   values(hid,r->>'name',r->>'description',(r->>'price')::numeric,(r->>'budgetedHours')::numeric,not deleted,r->>'type',deleted)
   on conflict(homeworks_id) do update set name=excluded.name,description=excluded.description,default_price=excluded.default_price,default_budgeted_hours=excluded.default_budgeted_hours,active=excluded.active,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted returning id into rid;
  elsif p_entity='users' then
   if nullif(r->>'email','') is not null and (select count(*) from public.employees where homeworks_id is null and lower(email)=lower(r->>'email'))=1 and not exists(select 1 from public.employees where homeworks_id=hid) then
    update public.employees set homeworks_id=hid where homeworks_id is null and lower(email)=lower(r->>'email');
   end if;
   insert into public.employees(homeworks_id,first_name,last_name,email,phone,active,homeworks_status,homeworks_deleted)
   values(hid,r->>'firstName',r->>'lastName',r->>'email',coalesce(nullif(r->>'cell',''),r->>'phone'),not deleted,st,deleted)
   on conflict(homeworks_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=excluded.phone,active=excluded.active,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted returning id into rid;
  elsif p_entity='events' then
   select id into pid from public.properties where homeworks_id=r->>'propertyId';
   if st not in ('OPEN','CLOSED','SKIPPED','CANCELLED','WAITLISTED','DELETED') then raise exception 'Unknown Homeworks event status %',st; end if;
   if pid is not null then
    select id into sid from public.services where homeworks_id=r#>>'{lineItems,0,itemId}';
    insert into public.jobs(homeworks_id,property_id,service_id,scheduled_date,scheduled_start_time,price,budgeted_hours,status,completed_at,crew_size,homeworks_status,homeworks_deleted,homeworks_notes)
    values(hid,pid,sid,case when st='WAITLISTED' then null else (r->>'startDate')::date end,case when (r->>'hasTime')::boolean then nullif(r->>'startTime','')::time else null end,(r->>'total')::numeric,(r->>'budgetedHours')::numeric,case when deleted or st in ('CANCELLED','DELETED') then 'cancelled' when st='CLOSED' then 'completed' when st='SKIPPED' then 'skipped' else 'scheduled' end,(r->>'closedAt')::timestamptz,jsonb_array_length(coalesce(r->'users','[]')),st,deleted,r->>'description')
    on conflict(homeworks_id) do update set property_id=excluded.property_id,service_id=excluded.service_id,scheduled_date=excluded.scheduled_date,scheduled_start_time=excluded.scheduled_start_time,price=excluded.price,budgeted_hours=excluded.budgeted_hours,status=excluded.status,completed_at=excluded.completed_at,crew_size=excluded.crew_size,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted,homeworks_notes=excluded.homeworks_notes returning id into rid;
    -- Replace source-owned assignments only, preserving unrelated manual crew and hours.
    for prior_member in select value from jsonb_array_elements(coalesce(old->'users','[]')) loop
     if not exists(select 1 from jsonb_array_elements(coalesce(r->'users','[]')) n where n->>'id'=prior_member->>'id') then
      delete from public.job_employees where job_id=rid and employee_id in(select id from public.employees where homeworks_id=prior_member->>'id') and hours_worked is null;
     end if;
    end loop;
    for member in select value from jsonb_array_elements(coalesce(r->'users','[]')) loop
     select id into eid from public.employees where homeworks_id=member->>'id';
     if eid is not null then insert into public.job_employees(job_id,employee_id) values(rid,eid) on conflict do nothing; end if;
    end loop;
   elsif r->>'propertyId' is not null then raise exception 'Missing property % for event %',r->>'propertyId',hid;
   end if; -- Property-less calendar events remain fully visible in the Homeworks source view.
  elsif p_entity in ('invoices','estimates','payments') then
   select id into cid from public.clients where homeworks_id=r->>'customerId';
   select id into pid from public.properties where homeworks_id=r->>'propertyId';
   if cid is null and r->>'customerId' is not null then raise exception 'Missing customer % for % %',r->>'customerId',p_entity,hid; end if;
   if cid is not null then
    if p_entity='invoices' then
     if st not in ('DRAFT','PENDING','PAID','PARTIALLY_PAID','PAST_DUE','WRITE_OFF') then raise exception 'Unknown invoice status %',st; end if;
     insert into public.invoices(homeworks_id,client_id,property_id,invoice_number,status,invoice_date,due_date,subtotal,tax,total,amount_paid,sent_at,homeworks_status,homeworks_deleted,homeworks_notes)
     values(hid,cid,pid,r->>'number',case when deleted or st='WRITE_OFF' then 'void' when st='DRAFT' then 'draft' when st='PAID' then 'paid' else 'sent' end,(r->>'date')::date,((r->>'dueDate')::timestamptz at time zone 'America/New_York')::date,(r->>'subtotal')::numeric,(r->>'tax')::numeric,(r->>'total')::numeric,(r->>'paidAmount')::numeric,(r->>'sentAt')::timestamptz,st,deleted,concat_ws(E'\n',nullif(r->>'notes',''),nullif(r->>'internalNotes','')))
     on conflict(homeworks_id) do update set client_id=excluded.client_id,property_id=excluded.property_id,invoice_number=excluded.invoice_number,status=excluded.status,invoice_date=excluded.invoice_date,due_date=excluded.due_date,subtotal=excluded.subtotal,tax=excluded.tax,total=excluded.total,amount_paid=excluded.amount_paid,sent_at=excluded.sent_at,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted,homeworks_notes=excluded.homeworks_notes returning id into rid;
    elsif p_entity='estimates' then
     if st not in ('DRAFT','PENDING','ACCEPTED','DECLINED','INVOICED','CHANGE_REQUESTED','CHANGE_UPDATED') then raise exception 'Unknown estimate status %',st; end if;
     insert into public.quotes(homeworks_id,client_id,quote_number,status,subtotal,tax,total,accepted_at,homeworks_status,homeworks_deleted,homeworks_notes)
     values(hid,cid,r->>'number',case when deleted or st='DECLINED' then 'declined' when st in ('ACCEPTED','INVOICED') then 'accepted' when st='DRAFT' then 'draft' else 'sent' end,(r->>'subtotal')::numeric,(r->>'tax')::numeric,(r->>'total')::numeric,(r->>'acceptedAt')::timestamptz,st,deleted,concat_ws(E'\n',nullif(r->>'notes',''),nullif(r->>'internalNotes','')))
     on conflict(homeworks_id) do update set client_id=excluded.client_id,quote_number=excluded.quote_number,status=excluded.status,subtotal=excluded.subtotal,tax=excluded.tax,total=excluded.total,accepted_at=excluded.accepted_at,homeworks_status=excluded.homeworks_status,homeworks_deleted=excluded.homeworks_deleted,homeworks_notes=excluded.homeworks_notes returning id into rid;
    else
     select id into pid from public.invoices where homeworks_id=r->>'invoiceId';
     if r->>'invoiceId' is not null and pid is null then raise exception 'Missing invoice % for payment %',r->>'invoiceId',hid; end if;
     insert into public.payments(homeworks_id,client_id,invoice_id,amount,payment_date,payment_method,external_reference,homeworks_deleted,homeworks_notes)
     values(hid,cid,pid,case when deleted then 0 when (r->>'isRefund')::boolean then -abs((r->>'totalAmount')::numeric) else (r->>'totalAmount')::numeric end,(r->>'date')::date,r->>'methodDisplayName','homeworks:'||hid,deleted,r->>'notes')
     on conflict(homeworks_id) do update set client_id=excluded.client_id,invoice_id=excluded.invoice_id,amount=excluded.amount,payment_date=excluded.payment_date,payment_method=excluded.payment_method,homeworks_deleted=excluded.homeworks_deleted,homeworks_notes=excluded.homeworks_notes returning id into rid;
    end if;
   end if;
  else raise exception 'Unsupported source entity %',p_entity;
  end if;
  insert into public.homeworks_records(entity,homeworks_id,payload,source_updated_at,projected_id) values(p_entity,hid,r,source_time,rid)
  on conflict(entity,homeworks_id) do update set payload=excluded.payload,source_updated_at=excluded.source_updated_at,projected_id=excluded.projected_id,changed_at=clock_timestamp();
  changed:=changed+1;
 end loop;
 insert into public.homeworks_sync_state(stream,cursor,last_success_at,last_full_at,last_error,failure_count)
 values(p_stream,case when p_complete then null else p_cursor end,case when p_complete then (p_cursor->>'startedAt')::timestamptz end,case when p_complete and (p_cursor->>'full')::boolean then (p_cursor->>'startedAt')::timestamptz end,null,0)
 on conflict(stream) do update set cursor=excluded.cursor,last_success_at=coalesce(excluded.last_success_at,public.homeworks_sync_state.last_success_at),last_full_at=coalesce(excluded.last_full_at,public.homeworks_sync_state.last_full_at),last_error=null,failure_count=0,updated_at=clock_timestamp();
 return changed;
end $$;
revoke all on function public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean) to service_role;
