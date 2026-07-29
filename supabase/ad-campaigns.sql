-- Managed advertising campaigns (Growth ops → Payments).
-- Run in Supabase SQL editor. Requires public.is_admin().

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid null references auth.users (id) on delete set null,
  name text not null default 'Ad campaign',
  status text not null default 'requested'
    check (status in ('requested', 'awaiting_client_approval', 'approved', 'client_rejected', 'active', 'paused', 'completed', 'canceled')),
  channels text[] not null default '{}',
  request_details text not null default '',
  requested_budget_cents integer not null default 0 check (requested_budget_cents >= 0),
  spent_cents integer not null default 0 check (spent_cents >= 0),
  billed_cents integer not null default 0 check (billed_cents >= 0),
  currency text not null default 'USD',
  growth_campaign_id text null,
  starts_on date null,
  ends_on date null,
  metadata jsonb not null default '{}'::jsonb
);

-- Expand the status constraint for databases created before client approval was added.
alter table public.ad_campaigns drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_status_check
  check (status in ('requested', 'awaiting_client_approval', 'approved', 'client_rejected', 'active', 'paused', 'completed', 'canceled'));

create index if not exists ad_campaigns_profile_idx
  on public.ad_campaigns (profile_id, created_at desc);

create index if not exists ad_campaigns_status_idx
  on public.ad_campaigns (status);

create table if not exists public.ad_spend_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  recorded_by uuid null references auth.users (id) on delete set null,
  spend_date date not null default (current_date),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  vendor text null,
  kind text not null default 'media'
    check (kind in ('media', 'management_fee', 'creative', 'other')),
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ad_spend_entries_campaign_idx
  on public.ad_spend_entries (campaign_id, spend_date desc);

create index if not exists ad_spend_entries_profile_idx
  on public.ad_spend_entries (profile_id, spend_date desc);

create table if not exists public.ad_campaign_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  provider text not null default 'helcim',
  provider_transaction_id text not null,
  approval_code text null,
  campaign_ids uuid[] not null default '{}',
  status text not null default 'verified' check (status in ('verified', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, provider_transaction_id)
);

create index if not exists ad_campaign_payments_profile_idx
  on public.ad_campaign_payments (profile_id, created_at desc);

alter table public.ad_campaigns enable row level security;
alter table public.ad_spend_entries enable row level security;
alter table public.ad_campaign_payments enable row level security;

drop policy if exists ad_campaigns_select on public.ad_campaigns;
create policy ad_campaigns_select on public.ad_campaigns
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists ad_campaigns_admin_write on public.ad_campaigns;
create policy ad_campaigns_admin_write on public.ad_campaigns
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists ad_spend_entries_select on public.ad_spend_entries;
create policy ad_spend_entries_select on public.ad_spend_entries
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists ad_spend_entries_admin_write on public.ad_spend_entries;
create policy ad_spend_entries_admin_write on public.ad_spend_entries
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists ad_campaign_payments_select on public.ad_campaign_payments;
create policy ad_campaign_payments_select on public.ad_campaign_payments
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists ad_campaign_payments_admin_write on public.ad_campaign_payments;
create policy ad_campaign_payments_admin_write on public.ad_campaign_payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.ad_campaigns is
  'Client-requested ad campaigns: requested budget, details, spend, and billed amount for Payments.';
comment on table public.ad_spend_entries is
  'Line items of media/management spend against an ad_campaigns row.';
comment on table public.ad_campaign_payments is
  'Server-verified advertising payments allocated to one or more managed campaigns.';
