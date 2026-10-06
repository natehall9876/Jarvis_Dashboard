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
