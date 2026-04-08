-- Run in Supabase SQL Editor (existing projects).
-- Attachments (MMS/email → storage), entity files (quotes/calendar), embeddable leads, AI toggles, document templates.

-- --- Storage bucket (public read for mirrored customer media) ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comm-attachments',
  'comm-attachments',
  true,
  52428800,
  NULL
)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Authenticated users upload only under their user_id prefix
DROP POLICY IF EXISTS "comm_attachments_insert_own" ON storage.objects;
CREATE POLICY "comm_attachments_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comm-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "comm_attachments_select_public" ON storage.objects;
CREATE POLICY "comm_attachments_select_public"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comm-attachments');

DROP POLICY IF EXISTS "comm_attachments_update_own" ON storage.objects;
CREATE POLICY "comm_attachments_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'comm-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "comm_attachments_delete_own" ON storage.objects;
CREATE POLICY "comm_attachments_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comm-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Service role bypasses RLS; serverless uses service role for inbound mirrors.

-- --- communication_attachments ---
CREATE TABLE IF NOT EXISTS public.communication_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  communication_event_id UUID NOT NULL REFERENCES public.communication_events(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  content_type TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_attachments_event_id
  ON public.communication_attachments (communication_event_id);

ALTER TABLE public.communication_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communication_attachments_own_user" ON public.communication_attachments;
CREATE POLICY "communication_attachments_own_user"
  ON public.communication_attachments FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "communication_attachments_office_manager" ON public.communication_attachments;
CREATE POLICY "communication_attachments_office_manager"
  ON public.communication_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = communication_attachments.user_id
    )
  )
  WITH CHECK (false);

COMMENT ON TABLE public.communication_attachments IS 'Inbound MMS/email files mirrored to storage; linked to communication_events.';

-- --- entity_attachments (quotes / calendar outbound files) ---
CREATE TABLE IF NOT EXISTS public.entity_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  content_type TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entity_attachments_one_parent CHECK (
    (quote_id IS NOT NULL AND calendar_event_id IS NULL)
    OR (quote_id IS NULL AND calendar_event_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_entity_attachments_quote ON public.entity_attachments (quote_id);
CREATE INDEX IF NOT EXISTS idx_entity_attachments_calendar ON public.entity_attachments (calendar_event_id);

ALTER TABLE public.entity_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_attachments_own_user" ON public.entity_attachments;
CREATE POLICY "entity_attachments_own_user"
  ON public.entity_attachments FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "entity_attachments_office_manager" ON public.entity_attachments;
CREATE POLICY "entity_attachments_office_manager"
  ON public.entity_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = entity_attachments.user_id
    )
  )
  WITH CHECK (false);

COMMENT ON TABLE public.entity_attachments IS 'User-uploaded files for quotes or calendar events (email/MMS outbound).';

-- --- profiles: embed, AI, document templates ---
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS embed_lead_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS embed_lead_slug TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_thread_summary_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_assistant_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document_template_quote TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document_template_receipt TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_embed_lead_slug_unique
  ON public.profiles (lower(trim(embed_lead_slug)))
  WHERE embed_lead_slug IS NOT NULL AND trim(embed_lead_slug) <> '';

COMMENT ON COLUMN public.profiles.embed_lead_slug IS 'Public slug for /embed/lead/{slug} lead capture form; unique when set.';
COMMENT ON COLUMN public.profiles.ai_thread_summary_enabled IS 'When true, user may call AI thread summary API for their conversations.';
COMMENT ON COLUMN public.profiles.ai_assistant_visible IS 'When false, prefer silent/automation-only AI features in UI.';
COMMENT ON COLUMN public.profiles.document_template_quote IS 'Optional HTML/text template for quote PDF header/footer; merged with generated line items.';
COMMENT ON COLUMN public.profiles.document_template_receipt IS 'Optional HTML/text template for completed-job receipt PDF.';
