-- Onboarding: demo access tracking, team invites, post-signup onboarding email log.
-- Run in Supabase SQL Editor.

create table if not exists public.demo_access_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  auth_user_id uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  granted_by uuid references auth.users (id) on delete set null,
  source text not null default 'self_serve',
  ticket_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists demo_access_grants_email_lower_idx on public.demo_access_grants (lower(email));
create index if not exists demo_access_grants_expires_at_idx on public.demo_access_grants (expires_at);

create table if not exists public.team_member_invites (
  id uuid primary key default gen_random_uuid(),
  account_owner_id uuid not null references auth.users (id) on delete cascade,
  invite_email text,
  invite_role text not null default 'user',
  shell_profile_id uuid references auth.users (id) on delete set null,
  token_hash text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists team_member_invites_owner_idx on public.team_member_invites (account_owner_id);
create index if not exists team_member_invites_email_idx on public.team_member_invites (lower(invite_email));

alter table public.demo_access_grants enable row level security;
alter table public.team_member_invites enable row level security;

-- Service role / admin only (no public policies).

insert into public.platform_settings (key, value)
values (
  'tradesman_onboarding_materials',
  jsonb_build_object(
    'welcome_subject', 'Welcome to Tradesman — your onboarding checklist',
    'welcome_intro', 'Thank you for signing up. Complete these steps to go live with SMS, voice, and customer communications.',
    'links', jsonb_build_array(
      jsonb_build_object('title', 'SMS consent & CTA page', 'url', 'https://tradesman.vercel.app/sms-cta', 'description', 'Host this page and link it from your website for A2P compliance.'),
      jsonb_build_object('title', 'Request onboarding phone number', 'url', 'mailto:admin@tradesman-us.com?subject=Tradesman%20onboarding%20phone%20number', 'description', 'We will buy a new Twilio number or port your existing number.'),
      jsonb_build_object('title', 'Google Business Profile — add your Tradesman number', 'url', 'https://business.google.com/', 'description', 'Update your advertised phone number after your Tradesman line is active.'),
      jsonb_build_object('title', 'SMS opt-in wording guide', 'url', 'https://tradesman.vercel.app/sms-cta', 'description', 'Sample consent language for forms and estimates.')
    )
  )
)
on conflict (key) do nothing;
