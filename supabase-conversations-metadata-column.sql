-- Add JSON metadata on conversations (portal field values, convoReadAt, etc.)
-- Fixes PostgREST PGRST204 when selecting/updating "metadata" if the column was never created.
-- Run in Supabase → SQL Editor. If the API still says the column is missing, wait a minute or run:
--   NOTIFY pgrst, 'reload schema';

alter table public.conversations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.conversations.metadata is 'JSON: portalValues, convoReadAt (sms/email/voicemail ISO timestamps), etc.';
