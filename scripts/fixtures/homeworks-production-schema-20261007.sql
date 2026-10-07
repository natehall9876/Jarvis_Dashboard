-- ISOLATED TEST DATABASE ONLY. Never apply this schema fixture to production.

-- Captured read-only from production catalogs 2026-10-07; contains no business rows.

CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;

CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;

CREATE TABLE public.app_members (user_id uuid NOT NULL,
role text NOT NULL,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.clients (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
first_name text,
last_name text,
phone text,
email text,
updated_at timestamp with time zone NOT NULL DEFAULT now(),
company_name text,
preferred_contact_method text DEFAULT 'sms'::text,
status text DEFAULT 'active'::text,
notes text,
homeworks_id text,
data_source text NOT NULL DEFAULT 'unverified'::text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.employees (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
first_name text NOT NULL,
last_name text,
phone text,
email text,
role text DEFAULT 'crew_member'::text,
hourly_rate numeric(10,2),
has_drivers_license boolean NOT NULL DEFAULT false,
active boolean NOT NULL DEFAULT true,
hire_date date,
notes text,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.homeworks_leases (name text NOT NULL,
owner uuid NOT NULL,
expires_at timestamp with time zone NOT NULL);

CREATE TABLE public.homeworks_records (entity text NOT NULL,
homeworks_id text NOT NULL,
payload jsonb NOT NULL,
source_updated_at timestamp with time zone,
changed_at timestamp with time zone NOT NULL DEFAULT now(),
projected_id uuid);

CREATE TABLE public.homeworks_sync_runs (id uuid NOT NULL,
started_at timestamp with time zone NOT NULL DEFAULT now(),
completed_at timestamp with time zone,
status text NOT NULL DEFAULT 'running'::text,
records integer NOT NULL DEFAULT 0,
error text);

CREATE TABLE public.homeworks_sync_state (stream text NOT NULL,
cursor jsonb,
last_success_at timestamp with time zone,
last_full_at timestamp with time zone,
last_error text,
failure_count integer NOT NULL DEFAULT 0,
updated_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.invoice_items (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
invoice_id uuid NOT NULL,
job_id uuid,
service_id uuid,
description text NOT NULL,
quantity numeric(10,2) NOT NULL DEFAULT 1,
unit_price numeric(12,2) NOT NULL DEFAULT 0,
total numeric(12,2) NOT NULL DEFAULT 0,
homeworks_id text);

CREATE TABLE public.invoices (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
client_id uuid NOT NULL,
property_id uuid,
invoice_number text,
status text NOT NULL DEFAULT 'draft'::text,
invoice_date date DEFAULT CURRENT_DATE,
due_date date,
subtotal numeric(12,2) NOT NULL DEFAULT 0,
tax numeric(12,2) NOT NULL DEFAULT 0,
total numeric(12,2) NOT NULL DEFAULT 0,
amount_paid numeric(12,2) NOT NULL DEFAULT 0,
sent_at timestamp with time zone,
paid_at timestamp with time zone,
notes text,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.job_employees (job_id uuid NOT NULL,
employee_id uuid NOT NULL,
hours_worked numeric(8,2));

CREATE TABLE public.jobs (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
property_id uuid NOT NULL,
service_id uuid,
service_agreement_id uuid,
route_id uuid,
scheduled_date date,
scheduled_start_time time without time zone,
stop_order integer,
status text NOT NULL DEFAULT 'scheduled'::text,
price numeric(12,2),
budgeted_hours numeric(8,2),
actual_hours numeric(8,2),
crew_size integer DEFAULT 1,
notes text,
completion_notes text,
started_at timestamp with time zone,
completed_at timestamp with time zone,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.payments (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
invoice_id uuid,
client_id uuid NOT NULL,
amount numeric(12,2) NOT NULL,
payment_date date DEFAULT CURRENT_DATE,
payment_method text,
external_reference text,
notes text,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.properties (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone DEFAULT now(),
client_id uuid,
street text,
city text,
state text,
zip text,
updated_at timestamp with time zone NOT NULL DEFAULT now(),
property_name text,
latitude numeric(10,7),
longitude numeric(10,7),
access_notes text,
service_notes text,
active boolean NOT NULL DEFAULT true,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.quote_items (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
quote_id uuid NOT NULL,
service_id uuid,
description text NOT NULL,
quantity numeric(10,2) NOT NULL DEFAULT 1,
unit_price numeric(12,2) NOT NULL DEFAULT 0,
total numeric(12,2) NOT NULL DEFAULT 0,
budgeted_hours numeric(8,2),
is_optional boolean NOT NULL DEFAULT false,
sort_order integer DEFAULT 0,
homeworks_id text);

CREATE TABLE public.quotes (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
client_id uuid NOT NULL,
property_id uuid,
quote_number text,
status text NOT NULL DEFAULT 'draft'::text,
subtotal numeric(12,2) NOT NULL DEFAULT 0,
tax numeric(12,2) NOT NULL DEFAULT 0,
total numeric(12,2) NOT NULL DEFAULT 0,
valid_until date,
sent_at timestamp with time zone,
accepted_at timestamp with time zone,
declined_at timestamp with time zone,
notes text,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

CREATE TABLE public.route_stops (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
route_id uuid NOT NULL,
property_id uuid NOT NULL,
stop_order integer,
estimated_minutes integer,
notes text);

CREATE TABLE public.routes (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
name text NOT NULL,
route_day text,
start_location text,
active boolean NOT NULL DEFAULT true,
notes text);

CREATE TABLE public.service_agreements (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
property_id uuid NOT NULL,
service_id uuid NOT NULL,
route_id uuid,
recurring_price numeric(12,2),
frequency text DEFAULT 'weekly'::text,
preferred_day text,
budgeted_hours numeric(8,2),
start_date date,
end_date date,
active boolean NOT NULL DEFAULT true,
notes text);

CREATE TABLE public.services (id uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
name text NOT NULL,
description text,
default_price numeric(12,2),
default_budgeted_hours numeric(8,2),
category text,
recurring_allowed boolean NOT NULL DEFAULT true,
active boolean NOT NULL DEFAULT true,
homeworks_id text,
homeworks_status text,
homeworks_deleted boolean NOT NULL DEFAULT false,
homeworks_notes text);

ALTER TABLE public.app_members ADD CONSTRAINT app_members_pkey PRIMARY KEY (user_id);

ALTER TABLE public.app_members ADD CONSTRAINT app_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'employee'::text])));

ALTER TABLE public.clients ADD CONSTRAINT clients_homeworks_id_key UNIQUE (homeworks_id);

ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);

ALTER TABLE public.homeworks_leases ADD CONSTRAINT homeworks_leases_pkey PRIMARY KEY (name);

ALTER TABLE public.homeworks_records ADD CONSTRAINT homeworks_records_pkey PRIMARY KEY (entity, homeworks_id);

ALTER TABLE public.homeworks_sync_runs ADD CONSTRAINT homeworks_sync_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.homeworks_sync_state ADD CONSTRAINT homeworks_sync_state_pkey PRIMARY KEY (stream);

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_homeworks_id_key UNIQUE (homeworks_id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE public.job_employees ADD CONSTRAINT job_employees_pkey PRIMARY KEY (job_id, employee_id);

ALTER TABLE public.jobs ADD CONSTRAINT jobs_homeworks_id_key UNIQUE (homeworks_id);

ALTER TABLE public.jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE public.properties ADD CONSTRAINT properties_homeworks_id_key UNIQUE (homeworks_id);

ALTER TABLE public.properties ADD CONSTRAINT properties_pkey PRIMARY KEY (id);

ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);

ALTER TABLE public.quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);

ALTER TABLE public.route_stops ADD CONSTRAINT route_stops_pkey PRIMARY KEY (id);

ALTER TABLE public.route_stops ADD CONSTRAINT route_stops_route_id_property_id_key UNIQUE (route_id, property_id);

ALTER TABLE public.routes ADD CONSTRAINT routes_pkey PRIMARY KEY (id);

ALTER TABLE public.service_agreements ADD CONSTRAINT service_agreements_pkey PRIMARY KEY (id);

ALTER TABLE public.services ADD CONSTRAINT services_pkey PRIMARY KEY (id);

ALTER TABLE public.app_members ADD CONSTRAINT app_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT;

ALTER TABLE public.job_employees ADD CONSTRAINT job_employees_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

ALTER TABLE public.job_employees ADD CONSTRAINT job_employees_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_route_id_fkey FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_service_agreement_id_fkey FOREIGN KEY (service_agreement_id) REFERENCES service_agreements(id) ON DELETE SET NULL;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;

ALTER TABLE public.payments ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;

ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.properties ADD CONSTRAINT properties_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;

ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;

ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;

ALTER TABLE public.quotes ADD CONSTRAINT quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;

ALTER TABLE public.quotes ADD CONSTRAINT quotes_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT;

ALTER TABLE public.route_stops ADD CONSTRAINT route_stops_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

ALTER TABLE public.route_stops ADD CONSTRAINT route_stops_route_id_fkey FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE;

ALTER TABLE public.service_agreements ADD CONSTRAINT service_agreements_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

ALTER TABLE public.service_agreements ADD CONSTRAINT service_agreements_route_id_fkey FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;

ALTER TABLE public.service_agreements ADD CONSTRAINT service_agreements_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;

CREATE INDEX idx_jobs_status ON public.jobs USING btree (status);

CREATE UNIQUE INDEX quotes_homeworks_id_key ON public.quotes USING btree (homeworks_id);

CREATE INDEX idx_route_stops_route ON public.route_stops USING btree (route_id);

CREATE INDEX idx_quotes_property ON public.quotes USING btree (property_id);

CREATE INDEX idx_service_agreements_route ON public.service_agreements USING btree (route_id);

CREATE UNIQUE INDEX payments_homeworks_id_key ON public.payments USING btree (homeworks_id);

CREATE INDEX idx_jobs_service ON public.jobs USING btree (service_id);

CREATE UNIQUE INDEX invoices_number_unique ON public.invoices USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);

CREATE UNIQUE INDEX quote_items_homeworks_id_key ON public.quote_items USING btree (homeworks_id);

CREATE INDEX idx_jobs_property ON public.jobs USING btree (property_id);

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);

CREATE INDEX idx_payments_invoice ON public.payments USING btree (invoice_id);

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id);

CREATE INDEX idx_service_agreements_property ON public.service_agreements USING btree (property_id);

CREATE UNIQUE INDEX services_homeworks_id_key ON public.services USING btree (homeworks_id);

CREATE UNIQUE INDEX services_name_unique ON public.services USING btree (lower(name));

CREATE UNIQUE INDEX employees_homeworks_id_key ON public.employees USING btree (homeworks_id);

CREATE INDEX idx_quotes_client ON public.quotes USING btree (client_id);

CREATE INDEX idx_properties_client ON public.properties USING btree (client_id);

CREATE UNIQUE INDEX invoice_items_homeworks_id_key ON public.invoice_items USING btree (homeworks_id);

CREATE INDEX idx_jobs_route ON public.jobs USING btree (route_id);

CREATE INDEX idx_jobs_scheduled_date ON public.jobs USING btree (scheduled_date);

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.homeworks_claim_lease(p_name text, p_owner uuid, p_seconds integer)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 with claimed as (insert into public.homeworks_leases(name,owner,expires_at) values(p_name,p_owner,clock_timestamp()+make_interval(secs=>least(p_seconds,300))) on conflict(name) do update set owner=excluded.owner,expires_at=excluded.expires_at where public.homeworks_leases.expires_at<clock_timestamp() returning 1) select exists(select 1 from claimed);
$function$;


CREATE OR REPLACE FUNCTION public.homeworks_release_lease(p_name text, p_owner uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ delete from public.homeworks_leases where name=p_name and owner=p_owner $function$;


CREATE OR REPLACE FUNCTION public.homeworks_apply_page(p_owner uuid, p_stream text, p_entity text, p_rows jsonb, p_cursor jsonb, p_complete boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r jsonb; old jsonb; hid text; cid uuid; pid uuid; rid uuid; sid uuid; eid uuid; deleted boolean; st text; changed integer:=0; source_time timestamptz; prev_time timestamptz; member jsonb; prior_member jsonb;
begin
 if not exists(select 1 from public.homeworks_leases where name='sync' and owner=p_owner and expires_at>clock_timestamp()) then raise exception 'Sync lease expired'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  hid:=r->>'id'; if hid is null then raise exception 'Source ID required'; end if;
  source_time:=nullif(r->>'updatedAt','')::timestamptz;
  old:=null; prev_time:=null; rid:=null; cid:=null; pid:=null; sid:=null;
  select payload,source_updated_at,projected_id into old,prev_time,rid from public.homeworks_records where entity=p_entity and homeworks_id=hid for update;
  if prev_time is not null and source_time is not null and prev_time>source_time then continue; end if;
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

    -- Apply source route order only when the payload actually includes routeStops.
    if r ? 'routeStops' then
      update public.jobs set stop_order=(
        select case when count(*)=1 then min((n->>'stopOrder')::integer)+1 else null end
        from jsonb_array_elements(r->'routeStops') n
        where n->>'routeDate'=r->>'startDate'
      ) where id=rid;
    end if;
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
     values(hid,cid,pid,r->>'number',case when deleted or st='WRITE_OFF' then 'void' when st='DRAFT' then 'draft' when st='PAID' then 'paid' else 'sent' end,(r->>'date')::date,(r->>'dueDate')::date,(r->>'subtotal')::numeric,(r->>'tax')::numeric,(r->>'total')::numeric,(r->>'paidAmount')::numeric,(r->>'sentAt')::timestamptz,st,deleted,concat_ws(E'\n',nullif(r->>'notes',''),nullif(r->>'internalNotes','')))
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
  if rid is not null and p_entity='invoices' then
     for member in select value from jsonb_array_elements(coalesce(r->'lineItems','[]')) loop
      select id into sid from public.services where homeworks_id=member->>'itemId';
      insert into public.invoice_items(homeworks_id,invoice_id,service_id,description,quantity,unit_price,total)
      values(hid||':'||(member->>'id'),rid,sid,concat_ws(' — ',nullif(member->>'name',''),nullif(member->>'description','')),(member->>'quantity')::numeric,(member->>'price')::numeric,(member->>'subtotalWithTax')::numeric)
      on conflict(homeworks_id) do update set service_id=excluded.service_id,description=excluded.description,quantity=excluded.quantity,unit_price=excluded.unit_price,total=excluded.total;
     end loop;
     delete from public.invoice_items i where i.invoice_id=rid and i.homeworks_id is not null and not exists(select 1 from jsonb_array_elements(coalesce(r->'lineItems','[]')) n where hid||':'||(n->>'id')=i.homeworks_id);
  elsif rid is not null and p_entity='estimates' then
     for member in select value from jsonb_array_elements(coalesce(r->'lineItems','[]')) loop
      select id into sid from public.services where homeworks_id=member->>'itemId';
      insert into public.quote_items(homeworks_id,quote_id,service_id,description,quantity,unit_price,total)
      values(hid||':'||(member->>'id'),rid,sid,concat_ws(' — ',nullif(member->>'name',''),nullif(member->>'description','')),(member->>'quantity')::numeric,(member->>'price')::numeric,(member->>'subtotalWithTax')::numeric)
      on conflict(homeworks_id) do update set service_id=excluded.service_id,description=excluded.description,quantity=excluded.quantity,unit_price=excluded.unit_price,total=excluded.total;
     end loop;
     delete from public.quote_items i where i.quote_id=rid and i.homeworks_id is not null and not exists(select 1 from jsonb_array_elements(coalesce(r->'lineItems','[]')) n where hid||':'||(n->>'id')=i.homeworks_id);
  end if;
  insert into public.homeworks_records(entity,homeworks_id,payload,source_updated_at,projected_id) values(p_entity,hid,r,source_time,rid)
  on conflict(entity,homeworks_id) do update set payload=excluded.payload,source_updated_at=excluded.source_updated_at,projected_id=excluded.projected_id,changed_at=clock_timestamp() where public.homeworks_records.payload is distinct from excluded.payload;
  if old is distinct from r then changed:=changed+1; end if;
 end loop;
 insert into public.homeworks_sync_state(stream,cursor,last_success_at,last_full_at,last_error,failure_count)
 values(p_stream,case when p_complete then null else p_cursor end,case when p_complete then (p_cursor->>'startedAt')::timestamptz end,case when p_complete and (p_cursor->>'full')::boolean then (p_cursor->>'startedAt')::timestamptz end,null,0)
 on conflict(stream) do update set cursor=excluded.cursor,last_success_at=coalesce(excluded.last_success_at,public.homeworks_sync_state.last_success_at),last_full_at=coalesce(excluded.last_full_at,public.homeworks_sync_state.last_full_at),last_error=null,failure_count=0,updated_at=clock_timestamp();
 return changed;
end $function$;


CREATE OR REPLACE FUNCTION public.save_route_stop_order(p_route_id uuid, p_stops jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer; total integer;
begin
 if not exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role='owner') then raise exception 'Owner access required'; end if;
 perform 1 from public.routes where id=p_route_id and active for update;
 if not found then raise exception 'Active route not found'; end if;
 if jsonb_typeof(p_stops)<>'array' then raise exception 'Stop list required'; end if;
 n:=jsonb_array_length(p_stops);
 select count(*) into total from public.route_stops where route_id=p_route_id;
 if n<>total or n=0 then raise exception 'Route changed; refresh before saving'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_stops) x)<>n or
    exists(select 1 from jsonb_array_elements(p_stops) with ordinality x(value,position)
      where (value->>'stop_order')::integer is distinct from position::integer
       or not exists(select 1 from public.route_stops s where s.route_id=p_route_id and s.id=(value->>'id')::uuid))
 then raise exception 'Invalid or stale route order'; end if;
 update public.route_stops s set stop_order=(x.value->>'stop_order')::integer
 from jsonb_array_elements(p_stops) x(value)
 where s.route_id=p_route_id and s.id=(x.value->>'id')::uuid;
end $function$;


CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER quotes_set_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER routes_set_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER service_agreements_set_updated_at BEFORE UPDATE ON public.service_agreements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homeworks_leases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homeworks_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homeworks_sync_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homeworks_sync_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_full_access ON public.payments AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.payments AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.employees AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.employees AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY owner_read ON public.homeworks_sync_state AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members
  WHERE ((app_members.user_id = ( SELECT auth.uid() AS uid)) AND app_members.active AND (app_members.role = 'owner'::text)))));

CREATE POLICY owner_read ON public.homeworks_sync_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members
  WHERE ((app_members.user_id = ( SELECT auth.uid() AS uid)) AND app_members.active AND (app_members.role = 'owner'::text)))));

CREATE POLICY authenticated_full_access ON public.services AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.services AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.quote_items AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.quote_items AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.quotes AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.quotes AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.job_employees AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.job_employees AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.clients AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.clients AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.invoices AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.invoices AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.route_stops AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.route_stops AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.properties AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.properties AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.invoice_items AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.invoice_items AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.routes AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.routes AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY authenticated_full_access ON public.service_agreements AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.service_agreements AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY owner_read ON public.homeworks_records AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members
  WHERE ((app_members.user_id = ( SELECT auth.uid() AS uid)) AND app_members.active AND (app_members.role = 'owner'::text)))));

CREATE POLICY authenticated_full_access ON public.jobs AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY owner_access_guard ON public.jobs AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text) AND m.active))));

CREATE POLICY own_membership ON public.app_members AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON public.clients,public.properties,public.jobs,public.quotes,public.quote_items,public.invoices,public.invoice_items,public.payments,public.services,public.service_agreements,public.job_employees,public.routes,public.route_stops,public.employees TO authenticated,anon;
GRANT SELECT ON public.app_members,public.homeworks_records,public.homeworks_sync_runs,public.homeworks_sync_state TO authenticated;
REVOKE ALL ON FUNCTION public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean),public.homeworks_claim_lease(text,uuid,integer),public.homeworks_release_lease(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean),public.homeworks_claim_lease(text,uuid,integer),public.homeworks_release_lease(text,uuid) TO service_role;
