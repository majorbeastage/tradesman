-- Run in Supabase SQL Editor (existing projects).
-- 1) Trouble tickets: archived flag, expanded priority, admin delete
-- 2) Profiles: optional Conversations voicemail transcript display override

-- --- support_tickets ---
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority IN ('low', 'medium', 'normal', 'high'));

UPDATE public.support_tickets SET priority = 'normal' WHERE priority IS NULL OR trim(priority) = '';

DROP POLICY IF EXISTS "Admins delete support_tickets" ON public.support_tickets;
CREATE POLICY "Admins delete support_tickets"
  ON public.support_tickets FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON COLUMN public.support_tickets.archived IS 'When true, hide from default admin list unless showing archived.';
COMMENT ON COLUMN public.support_tickets.priority IS 'low | medium | normal | high';

-- --- profiles (Conversations → Voicemails display) ---
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS voicemail_conversations_display TEXT NOT NULL DEFAULT 'use_channel';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_voicemail_conversations_display_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_voicemail_conversations_display_check
  CHECK (voicemail_conversations_display IN ('use_channel', 'summary', 'full_transcript'));

COMMENT ON COLUMN public.profiles.voicemail_conversations_display IS
  'use_channel: follow client_communication_channels.voicemail_mode. summary|full_transcript: override in Conversations UI.';
