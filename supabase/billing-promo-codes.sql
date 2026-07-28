-- Billing promo codes: clear retired JULY250 campaign. Keep empty store for future promos.
-- Run in Supabase SQL editor.

-- Allow public read of the promo settings key (unchanged list).
DROP POLICY IF EXISTS "Public read marketing platform settings" ON public.platform_settings;

CREATE POLICY "Public read marketing platform settings"
  ON public.platform_settings FOR SELECT TO anon, authenticated
  USING (
    key IN (
      'tradesman_about_us',
      'tradesman_privacy_policy',
      'tradesman_terms',
      'tradesman_sms_consent',
      'tradesman_signup_requirements',
      'tradesman_billing_promo_codes'
    )
  );

-- Replace store with empty codes (removes JULY250 homepage/signup campaign).
INSERT INTO public.platform_settings (key, value)
VALUES (
  'tradesman_billing_promo_codes',
  '{"codes":[]}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = '{"codes":[]}'::jsonb;
