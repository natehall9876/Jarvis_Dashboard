-- Run after the intelligence migration and production worker deployment are ready.
-- Reuse the Vault entry already matching Vercel CRON_SECRET; never print its value.
do $check$ begin
  if not exists(select 1 from vault.secrets where name = 'jarvis_activity_cron_secret') then
    raise exception 'Provision the matching cron secret before scheduling';
  end if;
end $check$;
select cron.schedule('jarvis-intelligence-worker', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://jarvis-dashboard-fawn.vercel.app/api/jarvis/intelligence/worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_activity_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 115000
  );
$job$);
