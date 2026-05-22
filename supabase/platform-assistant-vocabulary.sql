-- Platform assistant: admin-trained phrases (live vocabulary).
-- Run in Supabase SQL Editor after platform_settings exists.

-- All authenticated users may read trained phrases (assistant routing).
DROP POLICY IF EXISTS "Authenticated read assistant vocabulary" ON public.platform_settings;
CREATE POLICY "Authenticated read assistant vocabulary"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (key = 'platform_assistant_vocabulary');

INSERT INTO public.platform_settings (key, value)
VALUES ('platform_assistant_vocabulary', jsonb_build_object('entries', jsonb_build_array()))
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.platform_settings.value IS 'JSON settings; platform_assistant_vocabulary.entries = admin phrase → action training.';

-- Amber Train FAB: only when profiles.role = 'admin' (User, Office Manager, or Admin login — same auth user).
