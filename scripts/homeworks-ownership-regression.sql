-- Run against an isolated database as an administrator (psql -v ON_ERROR_STOP=1).
-- Synthetic fixtures only. Every write, role setting and helper rolls back.
BEGIN;
CREATE FUNCTION pg_temp.must_block(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE affected bigint;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE EXCEPTION 'OWNERSHIP TEST FAILED: allowed % (% rows)', statement, affected;
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE 'Managed in Homeworks%' THEN RAISE; END IF;
END $$;
-- Use a real owner in production-like RLS, never assume authenticated implies owner.
INSERT INTO auth.users(id) VALUES('90000000-0000-4000-8000-000000000001');
INSERT INTO public.app_members(user_id,role,active) VALUES('90000000-0000-4000-8000-000000000001','owner',true);
SELECT set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE service_role;
INSERT INTO public.clients(id,first_name,homeworks_id,data_source) VALUES
('90000000-0000-4000-8000-000000000010','SOURCE','ownership-test-client','homeworks_sync'),
('90000000-0000-4000-8000-000000000011','LOCAL',null,'owner_verified');
INSERT INTO public.properties(id,client_id,homeworks_id) VALUES
('90000000-0000-4000-8000-000000000020','90000000-0000-4000-8000-000000000010','ownership-test-property'),
('90000000-0000-4000-8000-000000000021','90000000-0000-4000-8000-000000000011',null);
INSERT INTO public.services(id,name,homeworks_id) VALUES('90000000-0000-4000-8000-000000000030','SOURCE','ownership-test-service');
INSERT INTO public.jobs(id,property_id,homeworks_id) VALUES
('90000000-0000-4000-8000-000000000040','90000000-0000-4000-8000-000000000020','ownership-test-job'),
('90000000-0000-4000-8000-000000000041','90000000-0000-4000-8000-000000000021',null),
('90000000-0000-4000-8000-000000000042','90000000-0000-4000-8000-000000000020',null);
INSERT INTO public.invoices(id,client_id,homeworks_id) VALUES
('90000000-0000-4000-8000-000000000050','90000000-0000-4000-8000-000000000010','ownership-test-invoice'),
('90000000-0000-4000-8000-000000000051','90000000-0000-4000-8000-000000000011',null);
INSERT INTO public.quotes(id,client_id,homeworks_id) VALUES('90000000-0000-4000-8000-000000000060','90000000-0000-4000-8000-000000000010','ownership-test-quote');
INSERT INTO public.payments(id,client_id,invoice_id,amount,homeworks_id) VALUES('90000000-0000-4000-8000-000000000070','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000050',10,'ownership-test-payment');
INSERT INTO public.invoice_items(id,invoice_id,description) VALUES('90000000-0000-4000-8000-000000000080','90000000-0000-4000-8000-000000000050','SOURCE');
INSERT INTO public.quote_items(id,quote_id,description) VALUES('90000000-0000-4000-8000-000000000081','90000000-0000-4000-8000-000000000060','SOURCE');
INSERT INTO public.employees(id,first_name) VALUES('90000000-0000-4000-8000-000000000090','TEST');
INSERT INTO public.job_employees(job_id,employee_id) VALUES('90000000-0000-4000-8000-000000000040','90000000-0000-4000-8000-000000000090');
INSERT INTO public.routes(id,name,route_day,active) VALUES('90000000-0000-4000-8000-000000000100','Native preference','monday',true);
INSERT INTO public.route_stops(id,route_id,property_id,stop_order) VALUES
('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000100','90000000-0000-4000-8000-000000000020',1),
('90000000-0000-4000-8000-000000000102','90000000-0000-4000-8000-000000000100','90000000-0000-4000-8000-000000000021',2);
INSERT INTO public.clients(id,first_name) VALUES('90000000-0000-4000-8000-000000000012','Missing source marker');
INSERT INTO public.homeworks_records(entity,homeworks_id,payload,projected_id) VALUES('customers','ownership-missing-marker','{}','90000000-0000-4000-8000-000000000012');
UPDATE public.employees SET homeworks_id='ownership-test-employee' WHERE id='90000000-0000-4000-8000-000000000090';
SET LOCAL ROLE authenticated;
-- A valid owner must really see all fixtures; an RLS zero-row update is not a pass.
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs WHERE id::text LIKE '90000000-%')<>3 THEN RAISE EXCEPTION 'Owner fixture inaccessible'; END IF;
END $$;
SELECT pg_temp.must_block($q$UPDATE public.clients SET email='changed@example.invalid' WHERE id='90000000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_block($q$UPDATE public.clients SET homeworks_id=null,data_source='owner_verified' WHERE id='90000000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_block($q$UPDATE public.clients SET homeworks_id='spoofed' WHERE id='90000000-0000-4000-8000-000000000011'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.clients(first_name,homeworks_id) VALUES('SPOOF','spoofed')$q$);
SELECT pg_temp.must_block($q$UPDATE public.clients SET first_name='spoofed' WHERE id='90000000-0000-4000-8000-000000000012'$q$);
SELECT set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"service_role"}',true);
SELECT pg_temp.must_block($q$UPDATE public.clients SET first_name='spoofed jwt' WHERE id='90000000-0000-4000-8000-000000000010'$q$);
SELECT set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT pg_temp.must_block($q$UPDATE public.properties SET street='changed' WHERE id='90000000-0000-4000-8000-000000000020'$q$);
SELECT pg_temp.must_block($q$UPDATE public.properties SET client_id='90000000-0000-4000-8000-000000000010' WHERE id='90000000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.must_block($q$UPDATE public.jobs SET scheduled_date='2027-01-01' WHERE id='90000000-0000-4000-8000-000000000040'$q$);
SELECT pg_temp.must_block($q$UPDATE public.jobs SET property_id='90000000-0000-4000-8000-000000000020' WHERE id='90000000-0000-4000-8000-000000000041'$q$);
SELECT pg_temp.must_block($q$UPDATE public.jobs SET price=999 WHERE id='90000000-0000-4000-8000-000000000042'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.jobs(property_id) VALUES('90000000-0000-4000-8000-000000000020')$q$);
SELECT pg_temp.must_block($q$UPDATE public.invoices SET amount_paid=999 WHERE id='90000000-0000-4000-8000-000000000050'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.invoices(client_id) VALUES('90000000-0000-4000-8000-000000000010')$q$);
SELECT pg_temp.must_block($q$UPDATE public.quotes SET total=999 WHERE id='90000000-0000-4000-8000-000000000060'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.quotes(client_id) VALUES('90000000-0000-4000-8000-000000000010')$q$);
SELECT pg_temp.must_block($q$UPDATE public.payments SET amount=999 WHERE id='90000000-0000-4000-8000-000000000070'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.payments(client_id,invoice_id,amount) VALUES('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000050',10)$q$);
SELECT pg_temp.must_block($q$UPDATE public.services SET default_price=999 WHERE id='90000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_block($q$UPDATE public.employees SET first_name='spoofed' WHERE id='90000000-0000-4000-8000-000000000090'$q$);
SELECT pg_temp.must_block($q$DELETE FROM public.employees WHERE id='90000000-0000-4000-8000-000000000090'$q$);
SELECT pg_temp.must_block($q$UPDATE public.invoice_items SET invoice_id='90000000-0000-4000-8000-000000000051' WHERE id='90000000-0000-4000-8000-000000000080'$q$);
SELECT pg_temp.must_block($q$DELETE FROM public.invoice_items WHERE id='90000000-0000-4000-8000-000000000080'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.invoice_items(invoice_id,description) VALUES('90000000-0000-4000-8000-000000000050','SPOOF')$q$);
SELECT pg_temp.must_block($q$UPDATE public.quote_items SET total=999 WHERE id='90000000-0000-4000-8000-000000000081'$q$);
SELECT pg_temp.must_block($q$DELETE FROM public.job_employees WHERE job_id='90000000-0000-4000-8000-000000000040'$q$);
SELECT pg_temp.must_block($q$UPDATE public.job_employees SET job_id='90000000-0000-4000-8000-000000000041' WHERE job_id='90000000-0000-4000-8000-000000000040'$q$);
SELECT pg_temp.must_block($q$INSERT INTO public.service_agreements(property_id,service_id) VALUES('90000000-0000-4000-8000-000000000020','90000000-0000-4000-8000-000000000030')$q$);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','properties','jobs','quotes','invoices','payments','services'] LOOP
  PERFORM pg_temp.must_block(format('DELETE FROM public.%I WHERE homeworks_id LIKE ''ownership-test-%%''',t));
  IF has_table_privilege('authenticated','public.'||t,'TRUNCATE') OR has_table_privilege('authenticated','public.'||t,'TRIGGER') THEN RAISE EXCEPTION 'Dangerous privilege remains: %',t; END IF;
 END LOOP;
END $$;
-- Native data must remain writable, including on projected rows.
UPDATE public.clients SET notes='Native client note' WHERE id='90000000-0000-4000-8000-000000000010';
UPDATE public.properties SET access_notes='Native access',service_notes='Native service' WHERE id='90000000-0000-4000-8000-000000000020';
UPDATE public.jobs SET notes='Native job note',completion_notes='Native completion',actual_hours=1.25 WHERE id='90000000-0000-4000-8000-000000000040';
UPDATE public.invoices SET notes='Native invoice note' WHERE id='90000000-0000-4000-8000-000000000050';
UPDATE public.quotes SET notes='Native quote note' WHERE id='90000000-0000-4000-8000-000000000060';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id='90000000-0000-4000-8000-000000000050' AND notes='Native invoice note')
   OR NOT EXISTS(SELECT 1 FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000060' AND notes='Native quote note')
 THEN RAISE EXCEPTION 'Native billing notes were blocked'; END IF;
END $$;
UPDATE public.job_employees SET hours_worked=1.25 WHERE job_id='90000000-0000-4000-8000-000000000040';
UPDATE public.employees SET notes='Native staffing',hourly_rate=25,has_drivers_license=true WHERE id='90000000-0000-4000-8000-000000000090';
SELECT public.save_route_stop_order('90000000-0000-4000-8000-000000000100','[{"id":"90000000-0000-4000-8000-000000000102","stop_order":1},{"id":"90000000-0000-4000-8000-000000000101","stop_order":2}]');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.route_stops WHERE id='90000000-0000-4000-8000-000000000101' AND stop_order=2) THEN RAISE EXCEPTION 'Native route order was blocked'; END IF;
 BEGIN
  PERFORM public.save_route_stop_order('90000000-0000-4000-8000-000000000100','[{"id":"90000000-0000-4000-8000-000000000101","stop_order":1}]');
  RAISE EXCEPTION 'Partial route change allowed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Route changed; refresh before saving' THEN RAISE; END IF;
 END;
 IF NOT EXISTS(SELECT 1 FROM public.route_stops WHERE id='90000000-0000-4000-8000-000000000101' AND stop_order=2) THEN RAISE EXCEPTION 'Rejected reorder changed the route'; END IF;
END $$;
UPDATE public.jobs SET price=123 WHERE id='90000000-0000-4000-8000-000000000041';
INSERT INTO public.jobs(property_id,price) VALUES('90000000-0000-4000-8000-000000000021',20);
INSERT INTO public.payments(client_id,invoice_id,amount) VALUES('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000051',10);
SET LOCAL ROLE service_role;
-- Prove the real sync RPC, not merely a privileged UPDATE, still works.
SELECT public.homeworks_claim_lease('sync','90000000-0000-4000-8000-000000000099',280);
SELECT public.homeworks_apply_page('90000000-0000-4000-8000-000000000099','ownership_customers','customers','[{"id":"ownership-test-client","firstName":"SOURCE REPROJECTED","status":"ACTIVE"}]',null,false);
SELECT public.homeworks_apply_page('90000000-0000-4000-8000-000000000099','ownership_jobs','events','[{"id":"ownership-test-job","propertyId":"ownership-test-property","status":"OPEN","startDate":"2026-10-07","hasTime":false,"total":65,"budgetedHours":0.5,"users":[],"lineItems":[],"routeStops":[]}]',null,false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.clients WHERE homeworks_id='ownership-test-client' AND first_name='SOURCE REPROJECTED' AND notes='Native client note') THEN RAISE EXCEPTION 'Client projection/native note failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE homeworks_id='ownership-test-job' AND price=65 AND scheduled_date='2026-10-07' AND notes='Native job note' AND completion_notes='Native completion' AND actual_hours=1.25) THEN RAISE EXCEPTION 'Job projection/native fields failed'; END IF;
 IF has_function_privilege('authenticated','public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Sync RPC exposed'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS: ownership, anti-spoofing, parents, children, deletion, privileges, native fields, real service-role projection' AS test_result;
ROLLBACK;
