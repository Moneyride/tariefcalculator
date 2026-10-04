-- Read only the authenticated user's account. No subscription data is changed.
create or replace function public.get_my_account_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'display_name', p.display_name,
    'is_pro', p.is_pro,
    'subscription_status', p.subscription_status,
    'subscription_provider', p.subscription_provider,
    'subscription_current_period_end', to_jsonb(p)->'subscription_current_period_end',
    'subscription_cancel_at_period_end', to_jsonb(p)->'subscription_cancel_at_period_end',
    'trial_started_at', to_jsonb(p)->'trial_started_at',
    'trial_ends_at', to_jsonb(p)->'trial_ends_at',
    'trial_reminder_sent_at', to_jsonb(p)->'trial_reminder_sent_at',
    'trial_expired_at', to_jsonb(p)->'trial_expired_at',
    'trial_expired_notice_shown_at', to_jsonb(p)->'trial_expired_notice_shown_at',
    'trial_converted_at', to_jsonb(p)->'trial_converted_at',
    'avatar_url', to_jsonb(p)->'avatar_url'
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_my_account_profile() from public, anon;
grant execute on function public.get_my_account_profile() to authenticated;
notify pgrst, 'reload schema';
