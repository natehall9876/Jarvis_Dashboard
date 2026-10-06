-- Preserve source ordering without replacing owner route preferences.
-- A Homeworks route stop is zero-based; Jarvis displays stops from one.
do $patch$
declare definition text;
begin
 select pg_get_functiondef('public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)'::regprocedure) into definition;
 if position('-- Apply source route order' in definition)=0 then
  definition:=replace(definition,'    -- Replace source-owned assignments only', $code$
    -- Apply source route order only when the payload actually includes routeStops.
    if r ? 'routeStops' then
      update public.jobs set stop_order=(
        select case when count(*)=1 then min((n->>'stopOrder')::integer)+1 else null end
        from jsonb_array_elements(r->'routeStops') n
        where n->>'routeDate'=r->>'startDate'
      ) where id=rid;
    end if;
    -- Replace source-owned assignments only$code$);
  if position('-- Apply source route order' in definition)=0 then raise exception 'Projection patch target not found'; end if;
  execute definition;
 end if;
end $patch$;

-- Save every stop together, scope by route and reject stale membership.
-- SECURITY INVOKER: existing owner RLS remains enforced.
create or replace function public.save_route_stop_order(p_route_id uuid,p_stops jsonb)
returns void language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.save_route_stop_order(uuid,jsonb) from public,anon;
grant execute on function public.save_route_stop_order(uuid,jsonb) to authenticated;
