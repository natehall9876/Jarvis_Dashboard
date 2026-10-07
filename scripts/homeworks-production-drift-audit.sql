-- Production drift diagnostics only. No DDL, DML, fixtures, explicit row locks, or RPC execution.
-- Audited against production 2026-10-07; source mapping fingerprint:
-- homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)
-- md5(pg_get_functiondef(...)) = 485e73e84f4620b7845ed3949fad9066
-- Compare the runtime definition before relying on these mappings after a deployment.
-- Payloads/contact values are compared inside SQL but never returned.
-- Results identify mismatches by UUID, Homeworks ID, safe label and field name.
-- Run with psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f this-file.sql
-- Use a read-only diagnostic connection; never run ownership regression here.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 1. Runtime catalog, privileges, columns and triggers
SELECT jsonb_build_object(
'audit',jsonb_build_object('timestamp',now(),'current_user',current_user,'read_only',current_setting('transaction_read_only')),
'columns',(SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('clients','properties','jobs','quotes','quote_items','invoices','invoice_items','payments','services','employees','job_employees','recurring_services','property_services','homeworks_records','homeworks_sync_state','homeworks_sync_failures','activity_log') ORDER BY table_name,ordinal_position)c),
'tables',(SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename)t),
'functions',(SELECT jsonb_agg(to_jsonb(f)) FROM (SELECT p.oid::regprocedure::text signature,p.prosecdef security_definer,p.proconfig,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1)f),
'triggers',(SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT c.relname table_name,t.tgname trigger_name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname)t),
'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname)p),
'grants',(SELECT jsonb_agg(to_jsonb(g)) FROM (SELECT grantee,table_name,string_agg(privilege_type,',' ORDER BY privilege_type) privileges FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY grantee,table_name ORDER BY table_name,grantee)g)
) AS audit;

-- 2. Local records under Homeworks parents and sync health
SELECT jsonb_build_object(
'timestamp',now(),
'local_payments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',i.id,'invoice_homeworks_id',i.homeworks_id,'invoice_number',i.invoice_number,'amount',p.amount,'payment_date',p.payment_date,'created_at',p.created_at)),'[]') FROM public.payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE p.homeworks_id IS NULL AND i.homeworks_id IS NOT NULL),
'local_jobs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'property_id',p.id,'property_homeworks_id',p.homeworks_id,'client_id',c.id,'client_label',concat_ws(' ',c.first_name,c.last_name),'scheduled_date',j.scheduled_date,'status',j.status,'created_at',j.created_at)),'[]') FROM public.jobs j JOIN public.properties p ON p.id=j.property_id LEFT JOIN public.clients c ON c.id=p.client_id WHERE j.homeworks_id IS NULL AND p.homeworks_id IS NOT NULL),
'local_properties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'client_id',c.id,'client_homeworks_id',c.homeworks_id,'client_label',concat_ws(' ',c.first_name,c.last_name),'active',p.active)),'[]') FROM public.properties p JOIN public.clients c ON c.id=p.client_id WHERE p.homeworks_id IS NULL AND c.homeworks_id IS NOT NULL),
'local_invoices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'client_id',c.id,'client_homeworks_id',c.homeworks_id,'property_id',i.property_id,'total',i.total)),'[]') FROM public.invoices i LEFT JOIN public.clients c ON c.id=i.client_id LEFT JOIN public.properties p ON p.id=i.property_id WHERE i.homeworks_id IS NULL AND (c.homeworks_id IS NOT NULL OR p.homeworks_id IS NOT NULL)),
'local_quotes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'quote_number',i.quote_number,'client_id',c.id,'client_homeworks_id',c.homeworks_id,'property_id',i.property_id,'total',i.total)),'[]') FROM public.quotes i LEFT JOIN public.clients c ON c.id=i.client_id LEFT JOIN public.properties p ON p.id=i.property_id WHERE i.homeworks_id IS NULL AND (c.homeworks_id IS NOT NULL OR p.homeworks_id IS NOT NULL)),
'local_invoice_items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'invoice_id',i.id,'invoice_homeworks_id',i.homeworks_id,'invoice_number',i.invoice_number,'total',x.total)),'[]') FROM public.invoice_items x JOIN public.invoices i ON i.id=x.invoice_id WHERE x.homeworks_id IS NULL AND i.homeworks_id IS NOT NULL),
'local_quote_items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'quote_id',i.id,'quote_homeworks_id',i.homeworks_id,'quote_number',i.quote_number,'total',x.total)),'[]') FROM public.quote_items x JOIN public.quotes i ON i.id=x.quote_id WHERE x.homeworks_id IS NULL AND i.homeworks_id IS NOT NULL),
'recurring_agreements',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'property_id',p.id,'property_homeworks_id',p.homeworks_id,'service_id',s.id,'service_homeworks_id',s.homeworks_id,'active',x.active,'frequency',x.frequency)),'[]') FROM public.service_agreements x JOIN public.properties p ON p.id=x.property_id LEFT JOIN public.services s ON s.id=x.service_id WHERE p.homeworks_id IS NOT NULL OR s.homeworks_id IS NOT NULL),
'sync_state',(SELECT jsonb_agg(jsonb_build_object('stream',stream,'last_success_at',last_success_at,'last_full_at',last_full_at,'updated_at',updated_at,'failure_count',failure_count,'has_error',last_error IS NOT NULL,'cursor_present',cursor IS NOT NULL)) FROM public.homeworks_sync_state),
'source_counts',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT entity,count(*) records,count(*) FILTER(WHERE projected_id IS NULL) null_projected_id,min(changed_at) oldest_changed_at,max(changed_at) latest_changed_at,max(source_updated_at) latest_source_updated_at FROM public.homeworks_records GROUP BY entity ORDER BY entity)x),
'sync_runs_24h',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT status,count(*) runs,min(started_at) first_started_at,max(started_at) last_started_at,max(completed_at) last_completed_at,sum(records) records FROM public.homeworks_sync_runs WHERE started_at>now()-interval '24 hours' GROUP BY status)x),
'failures',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT origin,reason,entity_type,count(*) failures,max(created_at) latest_at FROM public.homeworks_sync_failures GROUP BY origin,reason,entity_type)x)
) AS audit;

-- 3. Source-owned scalar projection comparison
-- Mirrors the deployed homeworks_apply_page conflict-update assignments.
-- homeworks_notes uses a literal backslash-n in the deployed invoice/estimate mapping.
-- payments.external_reference is insert-only there; checked separately below.
WITH source AS (
 SELECT entity,homeworks_id,payload r,projected_id,source_updated_at,changed_at,
 coalesce((payload->>'__deleted')::boolean,false)
 or coalesce((payload->>'isDeleted')::boolean,false)
 or coalesce(payload->>'deletedState','ACTIVE')<>'ACTIVE'
 or coalesce(payload->>'deletedStatus','ACTIVE')='DELETED' deleted,
 payload->>'status' st FROM public.homeworks_records
), projections AS (
 SELECT 'customers'::text entity,'clients'::text table_name,t.id,t.homeworks_id,concat_ws(' ',t.first_name,t.last_name) AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('first_name',r->>'firstName',
  'last_name',r->>'lastName',
  'email',r->>'email',
  'phone',coalesce(nullif(r->>'cell',''),r->>'phone'),
  'status',case when deleted or st='INACTIVE' then 'inactive' else 'active' end,
  'data_source','homeworks_sync'::text,
  'homeworks_status',st,
  'homeworks_deleted',deleted,
  'homeworks_notes',r->>'description') expected
 FROM public.clients t JOIN source s ON s.entity='customers' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'properties'::text entity,'properties'::text table_name,t.id,t.homeworks_id,'property projection' AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('client_id',(select id from public.clients where homeworks_id=r->>'customerId'),
  'property_name',r->>'name',
  'street',concat_ws(' ',nullif(r#>>'{address,street1}',''),nullif(r#>>'{address,street2}','')),
  'city',r#>>'{address,city}',
  'state',r#>>'{address,state}',
  'zip',r#>>'{address,zip}',
  'active',not deleted and coalesce((r->>'isActive')::boolean,false),
  'homeworks_status',r->>'deletedStatus',
  'homeworks_deleted',deleted,
  'homeworks_notes',r->>'notes') expected
 FROM public.properties t JOIN source s ON s.entity='properties' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'items'::text entity,'services'::text table_name,t.id,t.homeworks_id,t.name AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('name',r->>'name',
  'description',r->>'description',
  'default_price',(r->>'price')::numeric,
  'default_budgeted_hours',(r->>'budgetedHours')::numeric,
  'active',not deleted,
  'homeworks_status',r->>'type',
  'homeworks_deleted',deleted) expected
 FROM public.services t JOIN source s ON s.entity='items' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'users'::text entity,'employees'::text table_name,t.id,t.homeworks_id,'employee projection' AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('first_name',r->>'firstName',
  'last_name',r->>'lastName',
  'email',r->>'email',
  'phone',coalesce(nullif(r->>'cell',''),r->>'phone'),
  'active',not deleted,
  'homeworks_status',st,
  'homeworks_deleted',deleted) expected
 FROM public.employees t JOIN source s ON s.entity='users' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'events'::text entity,'jobs'::text table_name,t.id,t.homeworks_id,concat_ws(' ',t.scheduled_date::text,t.status) AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('property_id',(select id from public.properties where homeworks_id=r->>'propertyId'),
  'service_id',(select id from public.services where homeworks_id=r#>>'{lineItems,0,itemId}'),
  'scheduled_date',case when st='WAITLISTED' then null else (r->>'startDate')::date end,
  'scheduled_start_time',case when (r->>'hasTime')::boolean then nullif(r->>'startTime','')::time else null end,
  'price',(r->>'total')::numeric,
  'budgeted_hours',(r->>'budgetedHours')::numeric,
  'status',case when deleted or st in ('CANCELLED','DELETED') then 'cancelled' when st='CLOSED' then 'completed' when st='SKIPPED' then 'skipped' else 'scheduled' end,
  'completed_at',(r->>'closedAt')::timestamptz,
  'crew_size',jsonb_array_length(coalesce(r->'users','[]')),
  'homeworks_status',st,
  'homeworks_deleted',deleted,
  'homeworks_notes',r->>'description') expected
 FROM public.jobs t JOIN source s ON s.entity='events' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'invoices'::text entity,'invoices'::text table_name,t.id,t.homeworks_id,t.invoice_number AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('client_id',(select id from public.clients where homeworks_id=r->>'customerId'),
  'property_id',(select id from public.properties where homeworks_id=r->>'propertyId'),
  'invoice_number',r->>'number',
  'status',case when deleted or st='WRITE_OFF' then 'void' when st='DRAFT' then 'draft' when st='PAID' then 'paid' else 'sent' end,
  'invoice_date',(r->>'date')::date,
  'due_date',(r->>'dueDate')::date,
  'subtotal',(r->>'subtotal')::numeric,
  'tax',(r->>'tax')::numeric,
  'total',(r->>'total')::numeric,
  'amount_paid',(r->>'paidAmount')::numeric,
  'sent_at',(r->>'sentAt')::timestamptz,
  'homeworks_status',st,
  'homeworks_deleted',deleted,
  'homeworks_notes',concat_ws(E'\\n',nullif(r->>'notes',''),nullif(r->>'internalNotes',''))) expected
 FROM public.invoices t JOIN source s ON s.entity='invoices' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'estimates'::text entity,'quotes'::text table_name,t.id,t.homeworks_id,t.quote_number AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('client_id',(select id from public.clients where homeworks_id=r->>'customerId'),
  'quote_number',r->>'number',
  'status',case when deleted or st='DECLINED' then 'declined' when st in ('ACCEPTED','INVOICED') then 'accepted' when st='DRAFT' then 'draft' else 'sent' end,
  'subtotal',(r->>'subtotal')::numeric,
  'tax',(r->>'tax')::numeric,
  'total',(r->>'total')::numeric,
  'accepted_at',(r->>'acceptedAt')::timestamptz,
  'homeworks_status',st,
  'homeworks_deleted',deleted,
  'homeworks_notes',concat_ws(E'\\n',nullif(r->>'notes',''),nullif(r->>'internalNotes',''))) expected
 FROM public.quotes t JOIN source s ON s.entity='estimates' AND s.homeworks_id=t.homeworks_id
 UNION ALL
 SELECT 'payments'::text entity,'payments'::text table_name,t.id,t.homeworks_id,'payment projection' AS label,to_jsonb(t) actual,s.projected_id,s.source_updated_at,s.changed_at,
 jsonb_build_object('client_id',(select id from public.clients where homeworks_id=r->>'customerId'),
  'invoice_id',(select id from public.invoices where homeworks_id=r->>'invoiceId'),
  'amount',case when deleted then 0 when (r->>'isRefund')::boolean then -abs((r->>'totalAmount')::numeric) else (r->>'totalAmount')::numeric end,
  'payment_date',(r->>'date')::date,
  'payment_method',r->>'methodDisplayName',
  'homeworks_deleted',deleted,
  'homeworks_notes',r->>'notes') expected
 FROM public.payments t JOIN source s ON s.entity='payments' AND s.homeworks_id=t.homeworks_id
), differences AS (
 SELECT p.entity,p.table_name,p.id,p.homeworks_id,p.label,p.source_updated_at,p.changed_at,
 ARRAY(SELECT key FROM jsonb_each(p.expected) e WHERE p.actual->e.key IS DISTINCT FROM e.value ORDER BY key) mismatched_fields
 FROM projections p
)
SELECT jsonb_build_object(
'timestamp',now(),
'coverage',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT entity,table_name,count(*) compared,count(*) FILTER(WHERE cardinality(mismatched_fields)>0) mismatched_rows,sum(cardinality(mismatched_fields)) mismatched_fields FROM differences GROUP BY entity,table_name ORDER BY entity)x),
'differences',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY entity,id),'[]') FROM differences d WHERE cardinality(mismatched_fields)>0),
'pointer_mismatches',(SELECT coalesce(jsonb_agg(jsonb_build_object('entity',entity,'id',id,'homeworks_id',homeworks_id,'projected_id',projected_id)),'[]') FROM projections WHERE id IS DISTINCT FROM projected_id),
'payment_external_reference',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'homeworks_id',homeworks_id)),'[]') FROM public.payments WHERE homeworks_id IS NOT NULL AND external_reference IS DISTINCT FROM 'homeworks:'||homeworks_id)
) AS audit;

-- 4. Source/projection integrity, crew and route order
WITH projected AS (
SELECT 'customers'::text entity,id,homeworks_id FROM public.clients WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'properties'::text entity,id,homeworks_id FROM public.properties WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'items'::text entity,id,homeworks_id FROM public.services WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'users'::text entity,id,homeworks_id FROM public.employees WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'events'::text entity,id,homeworks_id FROM public.jobs WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'invoices'::text entity,id,homeworks_id FROM public.invoices WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'estimates'::text entity,id,homeworks_id FROM public.quotes WHERE homeworks_id IS NOT NULL
UNION ALL
SELECT 'payments'::text entity,id,homeworks_id FROM public.payments WHERE homeworks_id IS NOT NULL
), integrity AS (
 SELECT coalesce(p.entity,r.entity) entity,p.id,coalesce(p.homeworks_id,r.homeworks_id) homeworks_id,r.projected_id,
 CASE WHEN r.homeworks_id IS NULL THEN 'projection_without_retained_source'
 WHEN p.id IS NULL AND r.entity='events' AND r.payload->>'propertyId' IS NULL THEN 'source_only_calendar_event'
 WHEN p.id IS NULL AND r.entity IN ('estimates','invoices','payments') AND r.payload->>'customerId' IS NULL THEN 'source_without_customer'
 WHEN p.id IS NULL THEN 'source_without_projection'
 WHEN r.projected_id IS DISTINCT FROM p.id THEN 'stale_projection_pointer' END issue
 FROM projected p FULL JOIN public.homeworks_records r ON r.entity=p.entity AND r.homeworks_id=p.homeworks_id
), extra_crew AS (
 SELECT j.id job_id,j.homeworks_id job_homeworks_id,j.scheduled_date,je.employee_id,e.homeworks_id employee_homeworks_id,je.hours_worked
 FROM public.job_employees je JOIN public.jobs j ON j.id=je.job_id JOIN public.employees e ON e.id=je.employee_id
 JOIN public.homeworks_records r ON r.entity='events' AND r.homeworks_id=j.homeworks_id
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.payload->'users','[]')) u WHERE u->>'id'=e.homeworks_id)
), missing_crew AS (
 SELECT j.id job_id,j.homeworks_id job_homeworks_id,j.scheduled_date,u->>'id' employee_homeworks_id,e.id employee_id
 FROM public.jobs j JOIN public.homeworks_records r ON r.entity='events' AND r.homeworks_id=j.homeworks_id
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.payload->'users','[]')) u
 LEFT JOIN public.employees e ON e.homeworks_id=u->>'id'
 WHERE NOT EXISTS(SELECT 1 FROM public.job_employees je WHERE je.job_id=j.id AND je.employee_id=e.id)
), route_drift AS (
 SELECT j.id,j.homeworks_id,j.stop_order,
 (SELECT case when count(*)=1 then min((n->>'stopOrder')::integer)+1 else null end FROM jsonb_array_elements(r.payload->'routeStops') n WHERE n->>'routeDate'=r.payload->>'startDate') expected_stop_order
 FROM public.jobs j JOIN public.homeworks_records r ON r.entity='events' AND r.homeworks_id=j.homeworks_id WHERE r.payload ? 'routeStops'
)
SELECT jsonb_build_object(
'timestamp',now(),
'projection_counts',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT entity,count(*) projections FROM projected GROUP BY entity ORDER BY entity)x),
'integrity_issues',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY entity,homeworks_id),'[]') FROM integrity i WHERE issue IS NOT NULL),
'extra_crew',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY job_id,employee_id),'[]') FROM extra_crew x),
'missing_crew',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY job_id,employee_homeworks_id),'[]') FROM missing_crew x),
'route_order_drift',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM route_drift x WHERE stop_order IS DISTINCT FROM expected_stop_order),
'route_order_coverage',(SELECT count(*) FROM route_drift),
'clients_with_source_marker_without_id',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'data_source',data_source,'client_label',concat_ws(' ',first_name,last_name))),'[]') FROM public.clients WHERE homeworks_id IS NULL AND data_source IN ('homeworks','homeworks_sync','homeworks_import')),
'local_payments_on_source_clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'client_id',c.id,'client_homeworks_id',c.homeworks_id,'invoice_id',p.invoice_id,'amount',p.amount)),'[]') FROM public.payments p JOIN public.clients c ON c.id=p.client_id WHERE p.homeworks_id IS NULL AND c.homeworks_id IS NOT NULL),
'job_native_extensions',(SELECT jsonb_build_object('route_id',count(*) FILTER(WHERE route_id IS NOT NULL),'service_agreement_id',count(*) FILTER(WHERE service_agreement_id IS NOT NULL),'actual_hours',count(*) FILTER(WHERE actual_hours IS NOT NULL),'notes',count(*) FILTER(WHERE notes IS NOT NULL),'completion_notes',count(*) FILTER(WHERE completion_notes IS NOT NULL),'started_at',count(*) FILTER(WHERE started_at IS NOT NULL)) FROM public.jobs WHERE homeworks_id IS NOT NULL),
'nonprojected_source_owned_extensions',jsonb_build_object('client_company_name',(SELECT count(*) FROM public.clients WHERE homeworks_id IS NOT NULL AND company_name IS NOT NULL),'client_preferred_contact_method',(SELECT count(*) FROM public.clients WHERE homeworks_id IS NOT NULL AND preferred_contact_method IS NOT NULL),'invoice_paid_at',(SELECT count(*) FROM public.invoices WHERE homeworks_id IS NOT NULL AND paid_at IS NOT NULL),'quote_property_id',(SELECT count(*) FROM public.quotes WHERE homeworks_id IS NOT NULL AND property_id IS NOT NULL),'quote_sent_at',(SELECT count(*) FROM public.quotes WHERE homeworks_id IS NOT NULL AND sent_at IS NOT NULL),'quote_declined_at',(SELECT count(*) FROM public.quotes WHERE homeworks_id IS NOT NULL AND declined_at IS NOT NULL),'quote_valid_until',(SELECT count(*) FROM public.quotes WHERE homeworks_id IS NOT NULL AND valid_until IS NOT NULL))
) AS audit;

-- 5. Source line item comparison, policies and activity aggregates
WITH expected AS (
 SELECT 'invoice_items'::text table_name,i.id parent_id,r.homeworks_id parent_homeworks_id,r.homeworks_id||':'||(m->>'id') homeworks_id,
 jsonb_build_object('invoice_id',i.id,'service_id',(SELECT id FROM public.services WHERE homeworks_id=m->>'itemId'),'description',concat_ws(' — ',nullif(m->>'name',''),nullif(m->>'description','')),'quantity',(m->>'quantity')::numeric,'unit_price',(m->>'price')::numeric,'total',(m->>'subtotalWithTax')::numeric) expected
 FROM public.homeworks_records r JOIN public.invoices i ON i.homeworks_id=r.homeworks_id AND r.entity='invoices' CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.payload->'lineItems','[]')) m
 UNION ALL
 SELECT 'quote_items',i.id,r.homeworks_id,r.homeworks_id||':'||(m->>'id'),
 jsonb_build_object('quote_id',i.id,'service_id',(SELECT id FROM public.services WHERE homeworks_id=m->>'itemId'),'description',concat_ws(' — ',nullif(m->>'name',''),nullif(m->>'description','')),'quantity',(m->>'quantity')::numeric,'unit_price',(m->>'price')::numeric,'total',(m->>'subtotalWithTax')::numeric)
 FROM public.homeworks_records r JOIN public.quotes i ON i.homeworks_id=r.homeworks_id AND r.entity='estimates' CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.payload->'lineItems','[]')) m
), actual AS (
 SELECT 'invoice_items'::text table_name,id,homeworks_id,invoice_id parent_id,to_jsonb(i) actual FROM public.invoice_items i WHERE homeworks_id IS NOT NULL
 UNION ALL SELECT 'quote_items',id,homeworks_id,quote_id,to_jsonb(i) FROM public.quote_items i WHERE homeworks_id IS NOT NULL
), compared AS (
 SELECT coalesce(e.table_name,a.table_name) table_name,a.id,coalesce(e.homeworks_id,a.homeworks_id) homeworks_id,coalesce(e.parent_id,a.parent_id) parent_id,e.parent_homeworks_id,
 CASE WHEN a.id IS NULL THEN 'missing_child_projection' WHEN e.homeworks_id IS NULL THEN 'child_without_source_line' END issue,
 ARRAY(SELECT key FROM jsonb_each(e.expected) x WHERE a.actual->x.key IS DISTINCT FROM x.value ORDER BY key) mismatched_fields
 FROM expected e FULL JOIN actual a ON a.table_name=e.table_name AND a.homeworks_id=e.homeworks_id
)
SELECT jsonb_build_object(
'timestamp',now(),
'coverage',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT table_name,count(*) compared,count(*) FILTER(WHERE issue IS NOT NULL OR cardinality(mismatched_fields)>0) issue_rows FROM compared GROUP BY table_name)x),
'issues',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM compared x WHERE issue IS NOT NULL OR cardinality(mismatched_fields)>0),
'child_extra_fields',jsonb_build_object('invoice_item_job_id',(SELECT count(*) FROM public.invoice_items WHERE homeworks_id IS NOT NULL AND job_id IS NOT NULL),'quote_item_budgeted_hours',(SELECT count(*) FROM public.quote_items WHERE homeworks_id IS NOT NULL AND budgeted_hours IS NOT NULL),'quote_item_optional',(SELECT count(*) FROM public.quote_items WHERE homeworks_id IS NOT NULL AND is_optional IS TRUE)),
'activity_groups',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT entity_type,event_type,source,count(*) events,min(created_at) first_at,max(created_at) latest_at FROM public.activity_log GROUP BY entity_type,event_type,source ORDER BY entity_type,event_type,source)x),
'column_defaults',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT table_name,column_name,column_default FROM information_schema.columns WHERE table_schema='public' AND (table_name='clients' AND column_name='preferred_contact_method' OR table_name='quotes' AND column_name IN ('property_id','valid_until','sent_at','declined_at')))x),
'function_definition_fingerprint',(SELECT md5(pg_get_functiondef('public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)'::regprocedure))),
'runtime_roles',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT rolname,rolsuper,rolinherit,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator'))x),
'policies',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('clients','properties','jobs','quotes','invoices','payments','services','employees','job_employees','service_agreements','invoice_items','quote_items') ORDER BY tablename,policyname)x)
) AS audit;

-- 6. Runtime function inventory, references and historical activity
SELECT jsonb_build_object(
'timestamp',now(),
'public_functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,'acl',p.proacl,'definition_md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
'schema_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r,'usage',has_schema_privilege(r,'public','USAGE'),'create',has_schema_privilege(r,'public','CREATE'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r),
'non_sync_activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('activity_id',a.id,'entity_type',a.entity_type,'entity_id',a.entity_id,'homeworks_id',coalesce(j.homeworks_id,c.homeworks_id),'source',a.source,'event_type',a.event_type,'created_at',a.created_at,'detail_keys',ARRAY(SELECT jsonb_object_keys(a.detail)))),'[]') FROM public.activity_log a LEFT JOIN public.jobs j ON a.entity_type='job' AND j.id=a.entity_id LEFT JOIN public.clients c ON a.entity_type='client' AND c.id=a.entity_id WHERE a.source IN ('owner','manual') AND (j.homeworks_id IS NOT NULL OR c.homeworks_id IS NOT NULL)),
'preferred_contact_values',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT preferred_contact_method,count(*) clients FROM public.clients WHERE homeworks_id IS NOT NULL GROUP BY preferred_contact_method)x),
'crew_coverage',jsonb_build_object('projected_jobs',(SELECT count(*) FROM public.jobs WHERE homeworks_id IS NOT NULL),'assignment_rows',(SELECT count(*) FROM public.job_employees x JOIN public.jobs j ON j.id=x.job_id WHERE j.homeworks_id IS NOT NULL),'expected_members',(SELECT sum(jsonb_array_length(coalesce(payload->'users','[]'))) FROM public.homeworks_records WHERE entity='events')),
'constraint_inventory',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT c.relname table_name,co.conname constraint_name,co.contype constraint_type,pg_get_constraintdef(co.oid) definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('clients','properties','jobs','quotes','invoices','payments','services','employees','job_employees','service_agreements','invoice_items','quote_items') ORDER BY c.relname,co.conname)x)
) AS audit;

-- 7. Payload source IDs, unresolved references and enrichment evidence
WITH source_ids AS (
 SELECT entity,homeworks_id,projected_id FROM public.homeworks_records WHERE payload->>'id' IS DISTINCT FROM homeworks_id
), unresolved AS (
 SELECT r.entity,r.homeworks_id,r.projected_id,'customerId'::text field,r.payload->>'customerId' source_id FROM public.homeworks_records r LEFT JOIN public.clients c ON c.homeworks_id=r.payload->>'customerId' WHERE r.entity IN ('properties','invoices','estimates','payments') AND r.payload->>'customerId' IS NOT NULL AND c.id IS NULL
 UNION ALL
 SELECT r.entity,r.homeworks_id,r.projected_id,'propertyId',r.payload->>'propertyId' FROM public.homeworks_records r LEFT JOIN public.properties p ON p.homeworks_id=r.payload->>'propertyId' WHERE r.entity IN ('events','invoices','estimates') AND r.payload->>'propertyId' IS NOT NULL AND p.id IS NULL
 UNION ALL
 SELECT r.entity,r.homeworks_id,r.projected_id,'invoiceId',r.payload->>'invoiceId' FROM public.homeworks_records r LEFT JOIN public.invoices i ON i.homeworks_id=r.payload->>'invoiceId' WHERE r.entity='payments' AND r.payload->>'invoiceId' IS NOT NULL AND i.id IS NULL
 UNION ALL
 SELECT r.entity,r.homeworks_id,r.projected_id,'lineItems.itemId',m->>'itemId' FROM public.homeworks_records r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.payload->'lineItems','[]')) m LEFT JOIN public.services s ON s.homeworks_id=m->>'itemId' WHERE r.entity IN ('events','invoices','estimates') AND m->>'itemId' IS NOT NULL AND s.id IS NULL
)
SELECT jsonb_build_object('timestamp',now(),'source_id_mismatches',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM source_ids x),'unresolved_references',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM unresolved x),'enrichment_log_jobs',(SELECT jsonb_agg(jsonb_build_object('activity_id',a.id,'entity_id',j.id,'homeworks_id',j.homeworks_id,'scheduled_date',j.scheduled_date,'status',j.status,'created_at',a.created_at,'event_type',a.event_type,'source',a.source,'reported_fields',a.detail->'fields')) FROM public.activity_log a JOIN public.jobs j ON j.id=a.entity_id WHERE a.entity_type='job' AND a.event_type='homeworks_enriched' AND a.source='owner'),'nonempty_source_users',(SELECT count(*) FROM public.homeworks_records WHERE entity='events' AND jsonb_array_length(coalesce(payload->'users','[]'))>0)) AS audit;

COMMIT;
