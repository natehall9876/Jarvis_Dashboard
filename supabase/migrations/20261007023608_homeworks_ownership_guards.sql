-- Homeworks-owned records are read-only projections inside Jarvis.
-- No business data is repaired or deleted. Existing RLS and sync RPCs are retained.
-- SECURITY INVOKER throughout: neither caller-supplied JWT claims nor a custom
-- session flag can grant the trusted projection role.

CREATE FUNCTION public.homeworks_row_is_owned(p_table text, p_row jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE parent jsonb; source_entity text;
BEGIN
  IF p_row IS NULL THEN RETURN false; END IF;
  IF p_row->>'homeworks_id' IS NOT NULL
    OR p_row->>'data_source' = 'homeworks_sync'
    OR p_row->>'homeworks_status' IS NOT NULL
    OR coalesce((p_row->>'homeworks_deleted')::boolean,false)
  THEN RETURN true; END IF;
  source_entity := CASE p_table WHEN 'clients' THEN 'customers' WHEN 'properties' THEN 'properties'
    WHEN 'jobs' THEN 'events' WHEN 'quotes' THEN 'estimates' WHEN 'invoices' THEN 'invoices'
    WHEN 'payments' THEN 'payments' WHEN 'services' THEN 'items' WHEN 'employees' THEN 'users' END;
  -- Retained source identity also protects a pre-existing row whose marker drifted.
  IF source_entity IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.homeworks_records WHERE entity=source_entity AND projected_id=(p_row->>'id')::uuid
  ) THEN RETURN true; END IF;
  -- Lock parent rows while deciding ownership, preventing concurrent linking from
  -- turning an allowed local insert into a new child of a source-owned record.
  IF p_table IN ('properties','quotes','invoices','payments') AND p_row->>'client_id' IS NOT NULL THEN
    SELECT to_jsonb(c) INTO parent FROM public.clients c WHERE id=(p_row->>'client_id')::uuid FOR SHARE;
    IF public.homeworks_row_is_owned('clients',parent) THEN RETURN true; END IF;
  END IF;
  IF p_table IN ('jobs','quotes','invoices','service_agreements') AND p_row->>'property_id' IS NOT NULL THEN
    SELECT to_jsonb(p) INTO parent FROM public.properties p WHERE id=(p_row->>'property_id')::uuid FOR SHARE;
    IF public.homeworks_row_is_owned('properties',parent) THEN RETURN true; END IF;
  END IF;
  IF p_table IN ('payments','invoice_items') AND p_row->>'invoice_id' IS NOT NULL THEN
    SELECT to_jsonb(i) INTO parent FROM public.invoices i WHERE id=(p_row->>'invoice_id')::uuid FOR SHARE;
    IF public.homeworks_row_is_owned('invoices',parent) THEN RETURN true; END IF;
  END IF;
  IF p_table='quote_items' AND p_row->>'quote_id' IS NOT NULL THEN
    SELECT to_jsonb(q) INTO parent FROM public.quotes q WHERE id=(p_row->>'quote_id')::uuid FOR SHARE;
    IF public.homeworks_row_is_owned('quotes',parent) THEN RETURN true; END IF;
  END IF;
  IF p_table='job_employees' AND p_row->>'job_id' IS NOT NULL THEN
    SELECT to_jsonb(j) INTO parent FROM public.jobs j WHERE id=(p_row->>'job_id')::uuid FOR SHARE;
    IF public.homeworks_row_is_owned('jobs',parent) THEN RETURN true; END IF;
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.homeworks_row_is_owned(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.homeworks_row_is_owned(text,jsonb) TO authenticated,service_role;

CREATE FUNCTION public.enforce_homeworks_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE before_row jsonb; after_row jsonb; managed boolean; native_fields text[];
BEGIN
  -- Only the actual database service role bypasses this trigger. RLS bypass alone
  -- is not sufficient; security-definer wrappers cannot impersonate sync.
  IF current_user='service_role' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
  -- Source marker creation/removal is forbidden even on otherwise local rows.
  IF TG_OP='INSERT' AND (after_row->>'homeworks_id' IS NOT NULL
      OR after_row->>'homeworks_status' IS NOT NULL OR after_row->>'homeworks_notes' IS NOT NULL
      OR coalesce((after_row->>'homeworks_deleted')::boolean,false)
      OR after_row->>'data_source'='homeworks_sync') THEN
    RAISE EXCEPTION 'Managed in Homeworks: source identity can only be projected by sync' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND (
      (before_row->'homeworks_id') IS DISTINCT FROM (after_row->'homeworks_id')
      OR (before_row->'homeworks_status') IS DISTINCT FROM (after_row->'homeworks_status')
      OR (before_row->'homeworks_deleted') IS DISTINCT FROM (after_row->'homeworks_deleted')
      OR (before_row->'homeworks_notes') IS DISTINCT FROM (after_row->'homeworks_notes')
      OR (after_row->>'data_source'='homeworks_sync' AND before_row->>'data_source' IS DISTINCT FROM 'homeworks_sync')
  ) THEN RAISE EXCEPTION 'Managed in Homeworks: source identity is read-only' USING ERRCODE='42501'; END IF;
  managed:=public.homeworks_row_is_owned(TG_TABLE_NAME,before_row)
    OR public.homeworks_row_is_owned(TG_TABLE_NAME,after_row);
  IF managed THEN
    IF TG_OP<>'UPDATE' THEN
      RAISE EXCEPTION 'Managed in Homeworks: create and delete this operational record in Homeworks' USING ERRCODE='42501';
    END IF;
    -- Default-deny new columns. Only intentionally native enrichment may differ.
    native_fields:=CASE TG_TABLE_NAME
      WHEN 'clients' THEN ARRAY['notes','updated_at']
      WHEN 'properties' THEN ARRAY['access_notes','service_notes','updated_at']
      WHEN 'jobs' THEN ARRAY['notes','completion_notes','actual_hours','updated_at']
      WHEN 'invoices' THEN ARRAY['notes','updated_at']
      WHEN 'quotes' THEN ARRAY['notes','updated_at']
      WHEN 'job_employees' THEN ARRAY['hours_worked']
      WHEN 'service_agreements' THEN ARRAY['notes','updated_at']
      WHEN 'employees' THEN ARRAY['notes','hourly_rate','role','has_drivers_license','hire_date','updated_at']
      ELSE ARRAY['updated_at'] END;
    IF (before_row-native_fields) IS DISTINCT FROM (after_row-native_fields) THEN
      RAISE EXCEPTION 'Managed in Homeworks: source-owned fields are read-only in Jarvis' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.enforce_homeworks_ownership() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['clients','properties','jobs','quotes','invoices','payments','services',
    'invoice_items','quote_items','job_employees','service_agreements','employees'] LOOP
    EXECUTE format('CREATE TRIGGER enforce_homeworks_ownership BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_homeworks_ownership()',table_name);
    -- RLS does not cover TRUNCATE. Prevent alternate triggers from rewriting NEW
    -- after our guard, and remove unused REFERENCES privileges from browser roles.
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM PUBLIC, anon, authenticated',table_name);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.enforce_homeworks_ownership() IS
  'Homeworks operational rows and their children are read-only projections; service_role sync/write-through projects confirmed source state. Native notes and actual hours remain writable.';
