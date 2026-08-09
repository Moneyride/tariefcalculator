-- Allow authenticated users to store an avatar URL on their own profile.
-- Row Level Security on public.profiles still limits updates to auth.uid().

grant update (avatar_url) on table public.profiles to authenticated;
