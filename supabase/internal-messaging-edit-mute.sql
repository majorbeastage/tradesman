-- Additive migration: edit/delete for internal messages + per-thread mute prefs.
-- Safe to re-run. Run in Supabase SQL editor after internal-messaging.sql.

-- ---------------------------------------------------------------------------
-- Message edit / soft-delete
-- ---------------------------------------------------------------------------
alter table public.internal_messages
  add column if not exists edited_at timestamptz null;

alter table public.internal_messages
  add column if not exists deleted_at timestamptz null;

comment on column public.internal_messages.edited_at is 'Set when sender edits body.';
comment on column public.internal_messages.deleted_at is 'Soft-delete timestamp; body may be cleared for display.';

drop policy if exists internal_messages_update on public.internal_messages;
create policy internal_messages_update on public.internal_messages
  for update to authenticated
  using (auth.uid() = sender_id and public.is_internal_thread_member(thread_id, auth.uid()))
  with check (auth.uid() = sender_id and public.is_internal_thread_member(thread_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Per-thread notification mute (Messenger-style)
-- ---------------------------------------------------------------------------
alter table public.internal_thread_members
  add column if not exists notifications_muted boolean not null default false;

alter table public.internal_thread_members
  add column if not exists muted_until timestamptz null;

comment on column public.internal_thread_members.notifications_muted is 'When true (and muted_until is null or in the future), suppress push for this thread.';
comment on column public.internal_thread_members.muted_until is 'Optional mute expiry; null means muted until unmuted when notifications_muted is true.';
