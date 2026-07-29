# Supabase setup

1. Create a Supabase project.
2. Run `migrations/202607210001_saas_foundation.sql` in the SQL editor.
3. Run `migrations/202607210002_day_rate_settings.sql` after the foundation migration. This changes the stored rate to a day rate and removes the obsolete parking toggle.
4. Run `migrations/202607220001_equipment.sql` to add Pro equipment prices and custom equipment.
5. Run `migrations/202607220002_projects.sql` to add Pro projects, project days and Pro-only RLS policies.
6. Run `migrations/202607220003_subscription_period.sql` to store the paid-through date and scheduled cancellation state supplied by Shopify.
7. Run `migrations/202607240001_shopify_webhooks.sql` before enabling the Shopify webhooks.
8. Run `migrations/202607240002_workdays.sql` to add Pro-only standalone workday snapshots.
9. Run `migrations/202607250001_work_functions.sql` to add Pro functions with their own department and day rate.
10. Run `migrations/202607250002_workday_sharing.sql` to add redacted workday sharing and in-app notifications.
11. Run `migrations/202607250003_workday_share_invites.sql` to add private invitation links.
12. Run `migrations/202607270001_workday_names_and_participants.sql` to add workday names and participant display.
13. Run `migrations/202607280001_work_function_settings.sql` to store settings per function.
14. Run `migrations/202607280002_shared_private_participants.sql` to share non-account participant names safely.
15. Run `migrations/202607280003_shared_workday_live_updates.sql` to keep direct shares live and notify participants when the saved end time changes.
16. Run `migrations/202607290001_workday_start_notifications.sql` to schedule internal notifications for workdays saved before their start.
17. Run `migrations/202607290002_project_sharing.sql` to enable full project sharing.
18. Run `migrations/202607290003_web_push.sql` to add private device subscriptions and the general Web Push delivery queue.
19. In Authentication > URL configuration, set the production Site URL to `https://overuurtje.nl`.
20. Add `https://overuurtje.nl/account.html` to the allowed redirect URLs.
21. Add the project URL and publishable/anon key to Netlify as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The browser key is public by design. Never put the Supabase service-role key in Netlify build variables or frontend code.

`profiles.is_pro` and the subscription fields are deliberately read-only for authenticated browser users. The Netlify Shopify webhook updates them with the Supabase secret/service-role key. The key must never be placed in browser code.

Future user-owned tables should reference `profiles.id` through a `user_id` column and use the same owner-only RLS pattern. Projects, workdays and equipment additionally require an active Pro entitlement in their RLS policies.

## Web Push

Web Push reuses rows in `public.notifications`. This keeps workday, sharing and future notification types in one system.

1. Generate a VAPID key pair locally:
   `cd technisch && npm run push:generate-keys`
2. Keep `VAPID_PRIVATE_KEY` secret. Never add it to Git or browser code.
3. In Supabase Edge Functions, add these secrets:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT=mailto:info@thegearharbor.com`
   - `PUSH_CRON_SECRET` with a long random value
   - `PUBLIC_SITE_URL=https://overuurtje.nl`
4. Deploy `supabase/functions/send-push-notifications` without JWT verification. The repository's `supabase/config.toml` contains this setting.
5. Add the same public key to Netlify as `VAPID_PUBLIC_KEY`, then deploy the site.
6. Open `push-cron-setup.sql`, replace `PUSH_CRON_SECRET_VALUE` with the same cron secret and run the SQL once.
7. In Account > Meldingen, enable notifications separately on every device.

On iPhone and iPad, Web Push works for a Home Screen web app on iOS/iPadOS 16.4 or newer. The permission prompt must be opened by a user action, so Overuurtje only asks after pressing “Meldingen inschakelen”.
