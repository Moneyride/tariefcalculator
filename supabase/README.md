# Supabase setup

1. Create a Supabase project.
2. Run `migrations/202607210001_saas_foundation.sql` in the SQL editor.
3. Run `migrations/202607210002_day_rate_settings.sql` after the foundation migration. This changes the stored rate to a day rate and removes the obsolete parking toggle.
4. Run `migrations/202607220001_equipment.sql` to add Pro equipment prices and custom equipment.
5. Run `migrations/202607220002_projects.sql` to add Pro projects, project days and Pro-only RLS policies.
6. Run `migrations/202607220003_subscription_period.sql` to store the paid-through date and scheduled cancellation state supplied by Shopify.
7. Run `migrations/202607240001_shopify_webhooks.sql` before enabling the Shopify webhooks.
8. Run `migrations/202607240002_workdays.sql` to add Pro-only standalone workday snapshots.
9. In Authentication > URL configuration, set the production Site URL to `https://overuurtje.nl`.
10. Add `https://overuurtje.nl/account.html` to the allowed redirect URLs.
11. Add the project URL and publishable/anon key to Netlify as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The browser key is public by design. Never put the Supabase service-role key in Netlify build variables or frontend code.

`profiles.is_pro` and the subscription fields are deliberately read-only for authenticated browser users. The Netlify Shopify webhook updates them with the Supabase secret/service-role key. The key must never be placed in browser code.

Future user-owned tables should reference `profiles.id` through a `user_id` column and use the same owner-only RLS pattern. Projects, workdays and equipment additionally require an active Pro entitlement in their RLS policies.
