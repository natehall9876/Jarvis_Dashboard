-- Homeworks computes dueDate from date-only invoice/late-fee terms and returns midnight UTC.
-- Preserve that business date instead of moving it to the previous date in New York.
do $patch$ declare definition text; begin
 select pg_get_functiondef('public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)'::regprocedure) into definition;
 definition:=replace(definition,$old$((r->>'dueDate')::timestamptz at time zone 'America/New_York')::date$old$,$new$(r->>'dueDate')::date$new$);
 execute definition;
end $patch$;
update public.homeworks_sync_state set last_full_at=null where stream like 'invoices_%';
