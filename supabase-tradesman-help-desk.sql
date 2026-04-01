-- Global Tradesman help desk settings for admin-managed voice menu and greeting.
-- Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.platform_settings (key, value)
VALUES (
  'tradesman_help_desk',
  jsonb_build_object(
    'title', 'Tradesman Help Desk',
    'greeting_mode', 'ai_text',
    'greeting_text', 'Thank you for calling Tradesman. Please listen carefully to the following options.',
    'greeting_recording_url', '',
    'menu_enabled', false,
    'options', jsonb_build_array(
      jsonb_build_object('digit', '1', 'label', 'Customer care', 'enabled', true),
      jsonb_build_object('digit', '2', 'label', 'Technical support', 'enabled', true)
    )
  )
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS 'Admin-managed global settings such as Tradesman help desk voice menu configuration.';
