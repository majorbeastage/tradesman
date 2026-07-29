-- External Voice Prompt Studio: admin-curated scripts, resettable PIN links, and private audio versions.
-- Run in the Supabase SQL editor. Requires public.is_admin().

create extension if not exists pgcrypto;

create table if not exists public.voice_prompt_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prompt_key text not null unique,
  title text not null,
  category text not null default 'auto_attendant',
  script_text text not null,
  usage_notes text not null default '',
  scope text not null default 'platform' check (scope in ('platform', 'client_custom')),
  client_profile_id uuid null references public.profiles (id) on delete cascade,
  sort_order integer not null default 100,
  active boolean not null default true,
  active_recording_id uuid null,
  created_by uuid null references auth.users (id) on delete set null
);

create table if not exists public.voice_studio_access (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label text not null default 'Voice talent',
  public_token text not null unique,
  pin_salt text not null,
  pin_hash text not null,
  active boolean not null default true,
  expires_at timestamptz null,
  failed_attempts integer not null default 0,
  locked_until timestamptz null,
  last_used_at timestamptz null,
  created_by uuid null references auth.users (id) on delete set null
);

create table if not exists public.voice_studio_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  access_id uuid not null references public.voice_studio_access (id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now()
);

create table if not exists public.voice_prompt_recordings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  prompt_id uuid not null references public.voice_prompt_library (id) on delete cascade,
  access_id uuid null references public.voice_studio_access (id) on delete set null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null default 0,
  duration_seconds numeric null,
  version integer not null default 1,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'archived')),
  reviewer_notes text not null default '',
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users (id) on delete set null
);

create index if not exists voice_prompt_library_sort_idx
  on public.voice_prompt_library (active, sort_order, category);
create index if not exists voice_prompt_recordings_prompt_idx
  on public.voice_prompt_recordings (prompt_id, created_at desc);
create index if not exists voice_studio_sessions_expiry_idx
  on public.voice_studio_sessions (expires_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-prompt-studio',
  'voice-prompt-studio',
  false,
  8388608,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.voice_prompt_library enable row level security;
alter table public.voice_studio_access enable row level security;
alter table public.voice_studio_sessions enable row level security;
alter table public.voice_prompt_recordings enable row level security;

drop policy if exists voice_prompt_library_admin_all on public.voice_prompt_library;
create policy voice_prompt_library_admin_all on public.voice_prompt_library
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists voice_studio_access_admin_all on public.voice_studio_access;
create policy voice_studio_access_admin_all on public.voice_studio_access
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists voice_studio_sessions_admin_all on public.voice_studio_sessions;
create policy voice_studio_sessions_admin_all on public.voice_studio_sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists voice_prompt_recordings_admin_all on public.voice_prompt_recordings;
create policy voice_prompt_recordings_admin_all on public.voice_prompt_recordings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Initial platform scripts. Admin can edit, reorder, deactivate, and add more from Voice Studio.
insert into public.voice_prompt_library (prompt_key, title, category, script_text, usage_notes, sort_order)
values
  ('helpdesk.opening', 'Tradesman help desk opening', 'help_desk', 'Thank you for calling Tradesman.', 'Opening clip before the keypad menu.', 10),
  ('helpdesk.voicemail', 'Help desk voicemail', 'help_desk', 'Please leave your message after the tone. When you are finished, you may hang up.', 'Team voicemail prompt.', 20),
  ('helpdesk.trouble_ticket', 'Trouble ticket recording', 'help_desk', 'Please briefly explain your issue. Someone will return your call as soon as possible. When you are finished, you may hang up.', 'Support issue intake.', 30),
  ('helpdesk.no_message', 'No message received', 'help_desk', 'We did not receive your message. Goodbye.', 'Played when no recording is captured.', 40),
  ('helpdesk.invalid_selection', 'Invalid menu selection', 'help_desk', 'That option is not available. Goodbye.', 'Invalid keypad option.', 50),
  ('helpdesk.no_selection', 'No menu selection', 'help_desk', 'We did not receive your selection. Please call again. Goodbye.', 'Keypad timeout.', 60),
  ('helpdesk.connecting', 'Connecting caller', 'help_desk', 'Connecting you now. Please hold.', 'Reusable transfer prompt.', 70),
  ('helpdesk.billing', 'Billing introduction', 'help_desk', 'Connecting you to billing. You can also pay securely in the Tradesman app under Payments, or use the secure payment link on your account email. Please hold.', 'Billing transfer introduction.', 80),
  ('helpdesk.team_voicemail_unavailable', 'Team voicemail unavailable', 'help_desk', 'Team voicemail is not available right now. Goodbye.', 'Fallback when no team recipient exists.', 90),
  ('whisper.incoming', 'Forwarded-call whisper', 'whisper', 'Incoming Tradesman call.', 'Static introduction; caller name and number remain dynamic.', 100),
  ('whisper.accept_decline', 'Whisper accept or decline', 'whisper', 'Press 1 or say answer to accept. Press 2 or say decline to send the call to voicemail.', 'Used when call acceptance is required.', 110),
  ('attendant.service', 'Service requested', 'auto_attendant', 'Briefly describe what service you are calling about.', 'Platform auto-attendant template.', 120),
  ('attendant.schedule', 'Scheduling timing', 'auto_attendant', 'When are you interested in scheduling work?', 'The live system can append the selected service dynamically.', 130),
  ('attendant.name', 'Caller name', 'auto_attendant', 'May I have your name please?', 'Platform auto-attendant template.', 140),
  ('attendant.callback', 'Callback number', 'auto_attendant', 'What is the best phone number for us to call you back?', 'Platform auto-attendant template.', 150),
  ('attendant.sms_opt_in', 'SMS consent', 'auto_attendant', 'Do you agree to receive text messages regarding your service request? We do not send text messages for marketing purposes.', 'Consent wording; review before changing.', 160),
  ('voicemail.record_greeting', 'Record mailbox greeting', 'voicemail', 'After the tone, record the greeting callers hear. When you are finished, press any key.', 'Mailbox greeting recorder.', 170),
  ('voicemail.enter_pin', 'Enter mailbox PIN', 'voicemail', 'Please enter your mailbox PIN.', 'PIN recorder access.', 180),
  ('generic.goodbye', 'Standard goodbye', 'general', 'Thank you for calling Tradesman. Goodbye.', 'Reusable closing prompt.', 190),
  ('generic.try_again', 'Please try again', 'general', 'We could not complete your call. Please try again later. Goodbye.', 'Reusable failure prompt.', 200)
on conflict (prompt_key) do nothing;

comment on table public.voice_prompt_library is 'Platform and client-custom human voice scripts.';
comment on table public.voice_studio_access is 'Admin-created external recording links with salted PIN hashes.';
comment on table public.voice_prompt_recordings is 'Versioned private recordings submitted through Voice Studio.';
