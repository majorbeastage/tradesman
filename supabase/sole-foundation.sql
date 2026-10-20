-- SOLE foundation: legal acceptance, spend authorization, attribution outbox.
-- Run in the Supabase SQL editor for the Tradesman project before production onboarding.
-- This does not create charges, advertising accounts, or pooled funds.
-- Draft legal text lives in sole/documents.ts. Rows below record who accepted which version.

create table if not exists public.sole_business_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null,
  user_id uuid not null,
  partner_slug text not null default 'tradesman',
  document_slug text not null,
  document_version text not null,
  content_hash text not null,
  acceptance_method text not null,
  authority_affirmed boolean not null default false,
  unique (profile_id, partner_slug, document_slug, document_version)
);

create index if not exists sole_business_accept_profile_idx
  on public.sole_business_legal_acceptances (profile_id, partner_slug, document_version);

create table if not exists public.sole_advertising_authorizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null,
  user_id uuid not null,
  partner_slug text not null default 'tradesman',
  platforms text[] not null default '{}',
  budget_cents integer not null check (budget_cents >= 0),
  cadence text not null check (cadence in ('one_time', 'weekly', 'monthly')),
  renewal_day integer null check (renewal_day is null or (renewal_day >= 1 and renewal_day <= 28)),
  automation_mode text not null default 'manual' check (automation_mode in ('manual', 'advisory', 'automatic')),
  sole_fee_cents integer not null default 0,
  partner_fee_cents integer not null default 0,
  status text not null default 'recorded_not_charged',
  disclosure_version text not null,
  notes text not null default ''
);

create index if not exists sole_ad_auth_profile_idx
  on public.sole_advertising_authorizations (profile_id, created_at desc);

create table if not exists public.sole_attribution_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  partner_slug text not null,
  tenant_ref text not null,
  event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  status text not null default 'queued',
  unique (partner_slug, event_id)
);

create index if not exists sole_attribution_tenant_idx
  on public.sole_attribution_events (partner_slug, tenant_ref, occurred_at desc);

alter table public.sole_business_legal_acceptances enable row level security;
alter table public.sole_advertising_authorizations enable row level security;
alter table public.sole_attribution_events enable row level security;

drop policy if exists sole_business_accept_select_own on public.sole_business_legal_acceptances;
create policy sole_business_accept_select_own
  on public.sole_business_legal_acceptances
  for select
  to authenticated
  using (profile_id = auth.uid() or user_id = auth.uid());

drop policy if exists sole_ad_auth_select_own on public.sole_advertising_authorizations;
create policy sole_ad_auth_select_own
  on public.sole_advertising_authorizations
  for select
  to authenticated
  using (profile_id = auth.uid() or user_id = auth.uid());

-- Attribution rows are written by the server. Tenants read their own queued events.
drop policy if exists sole_attribution_select_own on public.sole_attribution_events;
create policy sole_attribution_select_own
  on public.sole_attribution_events
  for select
  to authenticated
  using (tenant_ref = auth.uid()::text);
