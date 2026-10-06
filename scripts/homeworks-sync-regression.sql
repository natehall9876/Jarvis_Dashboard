begin;
select public.homeworks_claim_lease('sync','9b2d3404-0000-4000-8000-000000000001',280);
do $$
declare initial_id uuid; final_id uuid; payload jsonb; checkpoint jsonb;
begin
payload:='[{"id":-910001,"firstName":"AUTOMATIC SYNC TRANSACTION TEST","lastName":"ROLLBACK","email":"old@example.invalid","phone":"","cell":"","status":"ACTIVE","description":"source note","isDeleted":false,"updatedAt":"2026-10-06T14:00:00Z"}]';
checkpoint:='{"after":-910001,"since":null,"startedAt":"2026-10-06T14:01:00Z","full":true}';
perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000001','test_customers','customers',payload,checkpoint,false);
select id into initial_id from public.clients where homeworks_id='-910001';
update public.clients set notes='OWNER NOTE MUST SURVIVE' where id=initial_id;
perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000001','test_customers','customers',payload,checkpoint,false);
select id into final_id from public.clients where homeworks_id='-910001';
if initial_id is distinct from final_id then raise exception 'Duplicate IDs created'; end if;
update public.clients set email='drift@example.invalid' where id=initial_id;
perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000001','test_customers','customers',payload,checkpoint,false);
if not exists(select 1 from public.clients where id=initial_id and email='old@example.invalid') then raise exception 'Full reconciliation failed to repair native projection drift'; end if;
payload:=jsonb_set(payload,'{0,email}','""'); payload:=jsonb_set(payload,'{0,updatedAt}','"2026-10-06T14:02:00Z"');
perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000001','test_customers','customers',payload,checkpoint,true);
if not exists(select 1 from public.clients where id=initial_id and email='' and notes='OWNER NOTE MUST SURVIVE' and homeworks_notes='source note') then raise exception 'Source clear or owner notes preservation failed'; end if;
if not exists(select 1 from public.homeworks_sync_state where stream='test_customers' and cursor is null and last_success_at='2026-10-06T14:01:00Z') then raise exception 'Success checkpoint missing'; end if;
begin
perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000001','test_failure','properties','[{"id":-910002,"customerId":-910999,"name":"must rollback"}]',checkpoint,false);
raise exception 'Missing dependency incorrectly accepted';
exception when others then
 if sqlerrm not like 'Missing customer%' then raise; end if;
end;
if exists(select 1 from public.homeworks_sync_state where stream='test_failure') then raise exception 'Failed page advanced checkpoint'; end if;
if has_function_privilege('anon','public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)','EXECUTE') or has_function_privilege('authenticated','public.homeworks_claim_lease(text,uuid,integer)','EXECUTE') then raise exception 'Privileged sync function exposed'; end if;
end $$;
select 'PASS: idempotency, explicit clearing, owner-note preservation, atomic checkpoint, dependency rollback, service-only grants' as test_result;
rollback;


begin;
select public.homeworks_claim_lease('sync','9b2d3404-0000-4000-8000-000000000002',280);
do $test$
declare source jsonb; parent uuid; expected integer; actual integer; revision timestamptz;
begin
 select payload,projected_id,changed_at into source,parent,revision from public.homeworks_records where entity='invoices' and jsonb_array_length(payload->'lineItems')>0 limit 1;
 if source is null then raise exception 'Real invoice fixture missing'; end if;
 expected:=jsonb_array_length(source->'lineItems');
 perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000002','test_invoice_lines','invoices',jsonb_build_array(source),'{"after":1,"startedAt":"2026-10-06T18:31:00Z","full":true}',true);
 perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000002','test_invoice_lines','invoices',jsonb_build_array(source),'{"after":1,"startedAt":"2026-10-06T18:31:00Z","full":true}',true);
 select count(*) into actual from public.invoice_items where invoice_id=parent and homeworks_id is not null;
 if actual<>expected then raise exception 'Expected % invoice lines; found %',expected,actual; end if;
 if not exists(select 1 from public.homeworks_records where entity='invoices' and homeworks_id=source->>'id' and changed_at=revision) then raise exception 'Unchanged reconciliation advanced data revision'; end if;
 source:=jsonb_set(source,'{lineItems}',(source->'lineItems')-0);
 perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000002','test_invoice_lines','invoices',jsonb_build_array(source),'{"after":1,"startedAt":"2026-10-06T18:31:00Z","full":true}',true);
 select count(*) into actual from public.invoice_items where invoice_id=parent and homeworks_id is not null;
 if actual<>expected-1 then raise exception 'Removed source invoice line persisted'; end if;
end $test$;
select 'PASS: invoice line projection, duplicate replay, unchanged revision, source line removal' as test_result;
rollback;

begin;
select public.homeworks_claim_lease('sync','9b2d3404-0000-4000-8000-000000000003',280);
do $test$ declare source jsonb; parent uuid; begin
select payload,projected_id into source,parent from homeworks_records where entity='invoices' and payload->>'dueDate' is not null limit 1;
if source is null then raise exception 'Dated invoice fixture missing'; end if;
perform public.homeworks_apply_page('9b2d3404-0000-4000-8000-000000000003','test_invoice_date','invoices',jsonb_build_array(source),'{"after":1,"startedAt":"2026-10-06T18:43:00Z","full":true}',true);
if not exists(select 1 from invoices where id=parent and due_date=(source->>'dueDate')::date) then raise exception 'Business due date shifted'; end if;
end $test$;
select 'PASS: Homeworks calendar due date retained across UTC/New York boundary' as test_result;
rollback;
