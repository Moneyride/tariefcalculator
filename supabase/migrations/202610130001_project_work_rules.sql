-- Existing RLS and project ownership checks also protect these project rules.
alter table public.projects add column if not exists work_rules jsonb not null default '{}'::jsonb;

-- Update only the note, so a concurrent time update is never overwritten.
create or replace function public.save_my_day_note(p_source_type text, p_source_id uuid, p_note text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare v_note text;
begin
  if length(coalesce(p_note, '')) > 5000 then raise exception 'Notitie is te lang'; end if;
  if p_source_type = 'project_day' then
    update public.project_days
    set calculation_data = jsonb_set(coalesce(calculation_data, '{}'::jsonb), '{dayNotes}', to_jsonb(coalesce(p_note, ''))), updated_at = now()
    where id = p_source_id and user_id = (select auth.uid())
    returning calculation_data->>'dayNotes' into v_note;
  elsif p_source_type = 'workday' then
    update public.workdays
    set calculation_data = jsonb_set(coalesce(calculation_data, '{}'::jsonb), '{dayNotes}', to_jsonb(coalesce(p_note, ''))), updated_at = now()
    where id = p_source_id and user_id = (select auth.uid())
    returning calculation_data->>'dayNotes' into v_note;
  else
    raise exception 'Onbekend dagtype';
  end if;
  if not found then raise exception 'Dag niet gevonden of geen toegang'; end if;
  return v_note;
end;
$$;
revoke all on function public.save_my_day_note(text, uuid, text) from public, anon;
grant execute on function public.save_my_day_note(text, uuid, text) to authenticated;
notify pgrst, 'reload schema';
