-- Desktop notification center feed. Run in Supabase SQL Editor.
-- Rows are created when notification triggers fire (client + scheduled edge function)
-- and are shown in the app's bottom-right notification center.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  user_id uuid not null,
  -- new_lead | estimate_approved | calendar_upcoming | calendar_completed | workflow_step_completed | assigned_step_ready
  kind text not null,
  title text not null,
  body text null,
  customer_id uuid null,
  quote_id uuid null,
  calendar_event_id uuid null,
  -- Optional page + navigation payload for click-through (e.g. { "page": "customers" }).
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id) where read_at is null;

-- De-dupe guard for scheduled/time-based inserts (e.g. one calendar_upcoming per event).
create unique index if not exists user_notifications_dedupe_idx
  on public.user_notifications (user_id, kind, calendar_event_id)
  where calendar_event_id is not null;

-- Row-level security: users see and manage only their own notifications.
alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_select_own" on public.user_notifications;
create policy "user_notifications_select_own"
  on public.user_notifications for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_notifications_insert_own" on public.user_notifications;
create policy "user_notifications_insert_own"
  on public.user_notifications for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_notifications_update_own" on public.user_notifications;
create policy "user_notifications_update_own"
  on public.user_notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_notifications_delete_own" on public.user_notifications;
create policy "user_notifications_delete_own"
  on public.user_notifications for delete to authenticated
  using (auth.uid() = user_id);
