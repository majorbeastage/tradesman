-- One-time, short-lived exchange codes for Main app -> Messaging SSO.
-- The deep link carries only the opaque code; each app receives its own
-- independently rotating Supabase refresh token after redemption.

create table if not exists public.messaging_handoff_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null
);

create index if not exists messaging_handoff_codes_user_idx
  on public.messaging_handoff_codes (user_id, created_at desc);

create index if not exists messaging_handoff_codes_expiry_idx
  on public.messaging_handoff_codes (expires_at)
  where used_at is null;

alter table public.messaging_handoff_codes enable row level security;

-- No browser role receives table access. The Vercel endpoint uses service role
-- after authenticating the issuer or validating the unguessable one-time code.
revoke all on table public.messaging_handoff_codes from anon, authenticated;

comment on table public.messaging_handoff_codes is
  'Hashed 60-second, single-use codes exchanged for an independent Messaging auth session.';
