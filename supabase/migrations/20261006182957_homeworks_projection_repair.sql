-- Reconcile native projections even when source payload is unchanged; never overwrite separate owner notes.
alter table public.invoice_items add column if not exists homeworks_id text;
create unique index if not exists invoice_items_homeworks_id_key on public.invoice_items(homeworks_id);
alter table public.quote_items add column if not exists homeworks_id text;
create unique index if not exists quote_items_homeworks_id_key on public.quote_items(homeworks_id);
do $patch$ declare definition text; begin
 select pg_get_functiondef('public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)'::regprocedure) into definition;
 definition:=replace(definition,
 'if old=r or (prev_time is not null and source_time is not null and prev_time>source_time) then continue; end if;',
 'if prev_time is not null and source_time is not null and prev_time>source_time then continue; end if;');
 definition:=replace(definition,
 'projected_id=excluded.projected_id,changed_at=clock_timestamp();',
 'projected_id=excluded.projected_id,changed_at=clock_timestamp() where public.homeworks_records.payload is distinct from excluded.payload;');
 if position('if old is distinct from r then changed' in definition)=0 then
  definition:=replace(definition,'changed:=changed+1;','if old is distinct from r then changed:=changed+1; end if;');
 end if;
 if position('insert into public.invoice_items' in definition)=0 then
  definition:=replace(definition,'  insert into public.homeworks_records', $code$  if rid is not null and p_entity='invoices' then
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
  insert into public.homeworks_records$code$);
 end if;
 execute definition;
end $patch$;
-- Let the next automatic run populate newly added projections from source.
update public.homeworks_sync_state set last_full_at=null where stream like 'invoices_%' or stream like 'estimates_%';
