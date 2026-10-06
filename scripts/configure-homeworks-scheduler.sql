-- Production scheduler; secrets are provisioned separately in Supabase Vault and Vercel.
-- HOMEWORKS_SYNC_SECRET must equal Vault's jarvis_homeworks_sync_secret.
-- The named schedule replaces an existing job instead of creating duplicates.
do $check$ begin
 if not exists(select 1 from vault.secrets where name='jarvis_homeworks_sync_secret') then
  raise exception 'Provision jarvis_homeworks_sync_secret in Vault before scheduling';
 end if;
end $check$;
select cron.schedule('jarvis-homeworks-sync','*/5 * * * *',$job$
 select net.http_post(
  url:='https://jarvis-dashboard-fawn.vercel.app/api/integrations/homeworks/scheduled',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='jarvis_homeworks_sync_secret')),
  body:='{"trigger":"scheduled_reconciliation"}'::jsonb,
  timeout_milliseconds:=260000);
$job$);
