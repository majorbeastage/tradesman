-- Robust internal-thread creation via a SECURITY DEFINER RPC.
-- Fixes:  new row violates row-level security policy for table "internal_threads"
--
-- Instead of the browser inserting the thread row (and relying on the
-- auth.uid() = created_by INSERT policy lining up perfectly), this function
-- creates the thread AND its members atomically as the function owner, using
-- auth.uid() as the creator. The client never inserts into internal_threads /
-- internal_thread_members directly, so that INSERT RLS class of errors is gone.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create or replace function public.create_internal_thread(
  p_is_group boolean,
  p_title text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_thread uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.internal_threads (created_by, is_group, title)
  values (v_uid, coalesce(p_is_group, false), nullif(btrim(coalesce(p_title, '')), ''))
  returning id into v_thread;

  -- Always include the creator.
  insert into public.internal_thread_members (thread_id, user_id)
  values (v_thread, v_uid)
  on conflict (thread_id, user_id) do nothing;

  -- Add the other members (skip nulls and the creator, dedup handled by unique index).
  if p_member_ids is not null then
    foreach v_member in array p_member_ids loop
      if v_member is not null and v_member <> v_uid then
        insert into public.internal_thread_members (thread_id, user_id)
        values (v_thread, v_member)
        on conflict (thread_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return v_thread;
end;
$$;

grant execute on function public.create_internal_thread(boolean, text, uuid[]) to authenticated;

-- Verify:
select proname, pronargs
from pg_proc
where proname = 'create_internal_thread';
