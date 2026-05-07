-- Row-level security for `customer_payment_events` (run after customer-payment-events.sql).
-- Ensures authenticated users only read/write their own activity rows.

alter table public.customer_payment_events enable row level security;

drop policy if exists "customer_payment_events_select_own" on public.customer_payment_events;
create policy "customer_payment_events_select_own"
  on public.customer_payment_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "customer_payment_events_insert_own" on public.customer_payment_events;
create policy "customer_payment_events_insert_own"
  on public.customer_payment_events for insert to authenticated
  with check (auth.uid() = user_id);
