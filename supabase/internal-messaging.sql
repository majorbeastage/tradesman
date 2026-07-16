-- Internal team instant messaging (member-to-member within an organization).
-- Run in Supabase SQL Editor. Separate from customer comms (conversations/messages).

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Account/org owner this thread belongs to (for future org-wide views). Nullable.
  org_owner_id uuid null,
  sender_id uuid not null,
  recipient_id uuid not null,
  body text not null,
  read_at timestamptz null
);

create index if not exists internal_messages_recipient_unread_idx
  on public.internal_messages (recipient_id) where read_at is null;

create index if not exists internal_messages_pair_idx
  on public.internal_messages (sender_id, recipient_id, created_at desc);

create index if not exists internal_messages_recipient_created_idx
  on public.internal_messages (recipient_id, created_at desc);

-- Row-level security: a user can see a message only if they are the sender or recipient.
alter table public.internal_messages enable row level security;

drop policy if exists "internal_messages_select_participant" on public.internal_messages;
create policy "internal_messages_select_participant"
  on public.internal_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "internal_messages_insert_sender" on public.internal_messages;
create policy "internal_messages_insert_sender"
  on public.internal_messages for insert to authenticated
  with check (auth.uid() = sender_id);

-- Recipients may mark messages read (update read_at).
drop policy if exists "internal_messages_update_recipient" on public.internal_messages;
create policy "internal_messages_update_recipient"
  on public.internal_messages for update to authenticated
  using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

-- Live updates for the messenger widget (best-effort; ignore if already added).
do $$
begin
  begin
    alter publication supabase_realtime add table public.internal_messages;
  exception when duplicate_object then null;
  when others then null;
  end;
end $$;
