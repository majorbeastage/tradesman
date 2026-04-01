-- ============================================================
-- Routing, inbox, and access foundation
-- Run after:
--   supabase-profiles-roles.sql
--   supabase-office-manager-rls.sql
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_communication_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'twilio',
  channel_kind TEXT NOT NULL DEFAULT 'voice_sms' CHECK (channel_kind IN ('voice_sms', 'email')),
  provider_sid TEXT,
  friendly_name TEXT,
  public_address TEXT NOT NULL,
  forward_to_phone TEXT,
  forward_to_email TEXT,
  voice_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  voicemail_enabled BOOLEAN NOT NULL DEFAULT true,
  voicemail_mode TEXT NOT NULL DEFAULT 'summary' CHECK (voicemail_mode IN ('summary', 'full_transcript')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_communication_channels
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_communication_channels_provider_public_address
  ON public.client_communication_channels (provider, public_address);

CREATE INDEX IF NOT EXISTS idx_client_communication_channels_user_id
  ON public.client_communication_channels (user_id);

CREATE INDEX IF NOT EXISTS idx_client_communication_channels_public_address
  ON public.client_communication_channels (public_address);

CREATE TABLE IF NOT EXISTS public.communication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.client_communication_channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sms', 'call', 'voicemail', 'email')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  external_id TEXT,
  subject TEXT,
  body TEXT,
  recording_url TEXT,
  transcript_text TEXT,
  summary_text TEXT,
  previous_customer BOOLEAN NOT NULL DEFAULT false,
  unread BOOLEAN NOT NULL DEFAULT true,
  read_at TIMESTAMPTZ,
  read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_events
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.communication_events
  ALTER COLUMN previous_customer SET DEFAULT false;

ALTER TABLE public.communication_events
  ALTER COLUMN unread SET DEFAULT true;

UPDATE public.communication_events
SET previous_customer = false
WHERE previous_customer IS NULL;

CREATE INDEX IF NOT EXISTS idx_communication_events_user_id_created_at
  ON public.communication_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_events_conversation_id
  ON public.communication_events (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_events_customer_id
  ON public.communication_events (customer_id);

CREATE TABLE IF NOT EXISTS public.client_external_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  system_kind TEXT NOT NULL CHECK (system_kind IN ('google_business_profile', 'other')),
  account_label TEXT NOT NULL,
  account_identifier TEXT,
  access_email TEXT,
  access_level TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'revoked')),
  notes TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_external_access_logs_user_id
  ON public.client_external_access_logs (user_id, created_at DESC);

ALTER TABLE public.client_communication_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_external_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated own client_communication_channels" ON public.client_communication_channels;
CREATE POLICY "Allow authenticated own client_communication_channels"
  ON public.client_communication_channels FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = client_communication_channels.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = client_communication_channels.user_id
    )
  );

DROP POLICY IF EXISTS "Allow authenticated own communication_events" ON public.communication_events;
CREATE POLICY "Allow authenticated own communication_events"
  ON public.communication_events FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = communication_events.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = communication_events.user_id
    )
  );

DROP POLICY IF EXISTS "Allow authenticated own client_external_access_logs" ON public.client_external_access_logs;
CREATE POLICY "Allow authenticated own client_external_access_logs"
  ON public.client_external_access_logs FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = client_external_access_logs.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = client_external_access_logs.user_id
    )
  );

COMMENT ON TABLE public.client_communication_channels IS 'Live routing for Twilio/Resend-style public numbers and inboxes; admin manages these without redeploying.';
COMMENT ON TABLE public.communication_events IS 'Normalized inbound/outbound communication log for unread state, voicemail transcripts, SMS, calls, and future email threads.';
COMMENT ON TABLE public.client_external_access_logs IS 'Audit log for client system access such as Google Business Profile access.';
