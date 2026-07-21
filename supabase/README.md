# Supabase setup

1. Create a Supabase project.
2. Run `migrations/202607210001_saas_foundation.sql` in the SQL editor.
3. In Authentication > URL configuration, set the production Site URL to `https://overuurtje.nl`.
4. Add `https://overuurtje.nl/account.html` to the allowed redirect URLs.
5. Add the project URL and publishable/anon key to Netlify as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The browser key is public by design. Never put the Supabase service-role key in Netlify build variables or frontend code.

`profiles.is_pro` and the subscription fields are deliberately read-only for authenticated browser users. A future Shopify webhook should update them with the service role from a Netlify Function or Supabase Edge Function.

Future `projects`, `equipment` and `history` tables should reference `profiles.id` through a `user_id` column and use the same owner-only RLS pattern as `settings`.
