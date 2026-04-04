-- Run in Supabase SQL Editor: public read for legal + signup settings, signup_extras on profiles.
-- Replaces narrow about-only policy with a single policy covering all public marketing keys.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.profiles.signup_extras IS 'Optional key/value pairs from admin-configured custom signup fields.';

DROP POLICY IF EXISTS "Public read tradesman about us" ON public.platform_settings;
DROP POLICY IF EXISTS "Public read marketing platform settings" ON public.platform_settings;

CREATE POLICY "Public read marketing platform settings"
  ON public.platform_settings FOR SELECT TO anon, authenticated
  USING (
    key IN (
      'tradesman_about_us',
      'tradesman_privacy_policy',
      'tradesman_terms',
      'tradesman_sms_consent',
      'tradesman_signup_requirements'
    )
  );

INSERT INTO public.platform_settings (key, value)
VALUES
  (
    'tradesman_privacy_policy',
    '{"title":"Privacy Policy","subtitle":"Edit in Admin → Sign up requirements.","body":""}'::jsonb
  ),
  (
    'tradesman_terms',
    '{"title":"Terms & Conditions","subtitle":"Edit in Admin → Sign up requirements.","body":""}'::jsonb
  ),
  (
    'tradesman_sms_consent',
    '{"title":"SMS Consent and Messaging Terms","subtitle":"Edit in Admin → Sign up requirements.","body":"","consent_statement":"","sample_message":""}'::jsonb
  ),
  (
    'tradesman_signup_requirements',
    '{}'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
