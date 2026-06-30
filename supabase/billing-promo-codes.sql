-- Billing promo codes for signup (public read for validation UI; admin write via is_admin()).
-- Run in Supabase SQL Editor after platform_settings exists.

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

INSERT INTO public.platform_settings (key, value)
VALUES (
  'tradesman_billing_promo_codes',
  '{
    "codes": [
      {
        "id": "promo-july250",
        "code": "JULY250",
        "description": "July 2026 only — use JULY250 at signup. Plans $250/mo or less: no billing in July. Plans over $250/mo: up to $250 July credit. Billing resumes August 1, 2026.",
        "active": true,
        "percent_off": 100,
        "benefit_start": "2026-07-01",
        "benefit_end": "2026-07-31",
        "billing_resume_date": "2026-08-01",
        "new_signups_only": true,
        "redeemable_from": "2026-06-01",
        "redeemable_until": "2026-07-31",
        "monthly_price_cap_usd": 250,
        "max_credit_usd": 250,
        "show_homepage_banner": true
      }
    ]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- If you already ran an older insert (ON CONFLICT DO NOTHING), patch JULY250 in place:
UPDATE public.platform_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          value,
          '{codes,0,show_homepage_banner}',
          'true'::jsonb,
          true
        ),
        '{codes,0,monthly_price_cap_usd}',
        '250'::jsonb,
        true
      ),
      '{codes,0,max_credit_usd}',
      '250'::jsonb,
      true
    ),
    '{codes,0,description}',
    '"July 2026 only — use JULY250 at signup. Plans $250/mo or less: no billing in July. Plans over $250/mo: up to $250 July credit. Billing resumes August 1, 2026."'::jsonb,
    true
  ),
  '{codes,0,billing_resume_date}',
  '"2026-08-01"'::jsonb,
  true
)
WHERE key = 'tradesman_billing_promo_codes'
  AND value #>> '{codes,0,code}' = 'JULY250';
