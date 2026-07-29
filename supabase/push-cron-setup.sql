-- Run only after deploying send-push-notifications and setting its secrets.
-- Replace PUSH_CRON_SECRET_VALUE with the same random value used for the
-- PUSH_CRON_SECRET Edge Function secret.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'PUSH_CRON_SECRET_VALUE',
  'overuurtje_push_cron_secret',
  'Secret used only by the push delivery cron'
)
where not exists (
  select 1 from vault.decrypted_secrets
  where name = 'overuurtje_push_cron_secret'
);

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'overuurtje-send-push-notifications'
  limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'overuurtje-send-push-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://kdevseeblnjwrqnanfke.supabase.co/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-overuurtje-push-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'overuurtje_push_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $$
);

