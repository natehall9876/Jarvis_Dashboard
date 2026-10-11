-- Apply only after the activity migration and worker deployment are ready.
-- Provision the matching CRON_SECRET in Vercel and this named Vault entry.
do $check$ begin
  if not exists(select 1 from vault.secrets where name = 'jarvis_activity_cron_secret') then
    raise exception 'Provision jarvis_activity_cron_secret in Vault before scheduling';
  end if;
end $check$;
select cron.schedule('jarvis-activity-worker', '* * * * *', $job$
  select net.http_post(
    url := 'https://jarvis-dashboard-fawn.vercel.app/api/jarvis/activity/worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_activity_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 115000
  );
$job$);
