-- Run as a database administrator. All fixture writes roll back.
begin;
set local role service_role;
do $$ declare own uuid:=gen_random_uuid(); row_data jsonb; hid text; n integer; begin
if not public.homeworks_claim_lease('sync',own,30) then raise exception 'Sync busy; retry the test later'; end if;
select homeworks_id,payload into hid,row_data from public.homeworks_records where entity='events' and projected_id is not null and not coalesce((payload->>'isDeleted')::boolean,false) order by homeworks_id limit 1;
if hid is null then raise exception 'A synced visit fixture is required'; end if;
row_data:=row_data||jsonb_build_object('routeStops',jsonb_build_array(jsonb_build_object('routeId',999999,'routeDate',row_data->>'startDate','stopOrder',0)));
perform public.homeworks_apply_page(own,'events_false','events',jsonb_build_array(row_data),null,false);
select stop_order into n from public.jobs where homeworks_id=hid;
if n is distinct from 1 then raise exception 'Source route order was lost'; end if;
row_data:=jsonb_set(row_data,'{routeStops}','[]');
perform public.homeworks_apply_page(own,'events_false','events',jsonb_build_array(row_data),null,false);
select stop_order into n from public.jobs where homeworks_id=hid;
if n is not null then raise exception 'Removed source order was not cleared'; end if;
end $$;
rollback;
