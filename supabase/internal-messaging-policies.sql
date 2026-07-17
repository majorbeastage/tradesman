-- Repair / ensure RLS policies for internal team messaging WITHOUT dropping tables or data.
-- Safe to run any time. Use this if you see:
--   new row violates row-level security policy for table "internal_threads"
-- which means RLS is enabled but the INSERT (and/or other) policies are missing.
-- Run in the Supabase SQL editor.

-- Membership check as SECURITY DEFINER so RLS policies can call it without recursing
-- on internal_thread_members' own row-level policy.
create or replace function public.is_internal_thread_member(p_thread uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.internal_thread_members m
    where m.thread_id = p_thread and m.user_id = p_user
  );
$$;

alter table public.internal_threads enable row level security;
alter table public.internal_thread_members enable row level security;
alter table public.internal_messages enable row level security;

-- Threads: visible to members; created by the signed-in user; members can edit title.
drop policy if exists internal_threads_select on public.internal_threads;
create policy internal_threads_select on public.internal_threads for select to authenticated
  using (public.is_internal_thread_member(id, auth.uid()));

drop policy if exists internal_threads_insert on public.internal_threads;
create policy internal_threads_insert on public.internal_threads for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists internal_threads_update on public.internal_threads;
create policy internal_threads_update on public.internal_threads for update to authenticated
  using (public.is_internal_thread_member(id, auth.uid()))
  with check (public.is_internal_thread_member(id, auth.uid()));

-- Members: visible to co-members. Inserts allowed for self, existing members, or the thread creator.
drop policy if exists internal_thread_members_select on public.internal_thread_members;
create policy internal_thread_members_select on public.internal_thread_members for select to authenticated
  using (public.is_internal_thread_member(thread_id, auth.uid()));

drop policy if exists internal_thread_members_insert on public.internal_thread_members;
create policy internal_thread_members_insert on public.internal_thread_members for insert to authenticated
  with check (
    auth.uid() = user_id
    or public.is_internal_thread_member(thread_id, auth.uid())
    or auth.uid() = (select created_by from public.internal_threads t where t.id = thread_id)
  );

-- A member may update only their own row (last_read_at).
drop policy if exists internal_thread_members_update on public.internal_thread_members;
create policy internal_thread_members_update on public.internal_thread_members for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Messages: readable by thread members; sender must be a member.
drop policy if exists internal_messages_select on public.internal_messages;
create policy internal_messages_select on public.internal_messages for select to authenticated
  using (public.is_internal_thread_member(thread_id, auth.uid()));

drop policy if exists internal_messages_insert on public.internal_messages;
create policy internal_messages_insert on public.internal_messages for insert to authenticated
  with check (auth.uid() = sender_id and public.is_internal_thread_member(thread_id, auth.uid()));

-- Live updates for the messenger widget (RLS still applies to delivered rows).
do $$
begin
  begin alter publication supabase_realtime add table public.internal_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.internal_thread_members; exception when others then null; end;
end $$;

-- Verify the policies now exist:
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename like 'internal_%'
order by tablename, policyname;
