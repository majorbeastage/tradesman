-- Customer payment activity log (link/barcode sends, posted payments, review checkpoints).
-- Run in Supabase SQL Editor.

create table if not exists public.customer_payment_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  customer_id uuid null,
  quote_id uuid null,
  calendar_event_id uuid null,
  event_type text not null,
  amount numeric(12,2) null,
  currency text null default 'USD',
  status text null default 'logged',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists customer_payment_events_user_created_idx
  on public.customer_payment_events (user_id, created_at desc);

create index if not exists customer_payment_events_quote_idx
  on public.customer_payment_events (quote_id);

create index if not exists customer_payment_events_calendar_idx
  on public.customer_payment_events (calendar_event_id);
