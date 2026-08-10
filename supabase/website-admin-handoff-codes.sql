-- One-time, short-lived exchange codes for Main app -> Website admin editor SSO.

create table if not exists public.website_admin_handoff_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null
);

create index if not exists website_admin_handoff_codes_user_idx
  on public.website_admin_handoff_codes (user_id, created_at desc);

create index if not exists website_admin_handoff_codes_expiry_idx
  on public.website_admin_handoff_codes (expires_at)
  where used_at is null;

alter table public.website_admin_handoff_codes enable row level security;

revoke all on table public.website_admin_handoff_codes from anon, authenticated;

comment on table public.website_admin_handoff_codes is
  'Hashed 60-second, single-use codes for Tradesman -> hosted website admin SSO.';
