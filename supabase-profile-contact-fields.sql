-- Add profile fields used by the Account tab.
-- Run in the Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS call_forwarding_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_forwarding_outside_business_hours BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_mode TEXT NOT NULL DEFAULT 'ai_text',
  ADD COLUMN IF NOT EXISTS voicemail_greeting_text TEXT,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_recording_url TEXT,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_pin TEXT;

COMMENT ON COLUMN public.profiles.primary_phone IS 'Primary business phone for the user profile.';
COMMENT ON COLUMN public.profiles.business_address IS 'Formatted business mailing/service address for the user profile.';
COMMENT ON COLUMN public.profiles.website_url IS 'Primary website URL for the business profile.';
COMMENT ON COLUMN public.profiles.address_line_1 IS 'Business address line 1.';
COMMENT ON COLUMN public.profiles.address_line_2 IS 'Business address line 2.';
COMMENT ON COLUMN public.profiles.address_city IS 'Business address city.';
COMMENT ON COLUMN public.profiles.address_state IS 'Business address state/province.';
COMMENT ON COLUMN public.profiles.address_zip IS 'Business address postal code.';
COMMENT ON COLUMN public.profiles.timezone IS 'IANA timezone used for business hours and routing behavior.';
COMMENT ON COLUMN public.profiles.business_hours IS 'Weekly business hours keyed by day.';
COMMENT ON COLUMN public.profiles.call_forwarding_enabled IS 'Live toggle for forwarding inbound Twilio calls to the user phone.';
COMMENT ON COLUMN public.profiles.call_forwarding_outside_business_hours IS 'When true, calls may still forward outside configured business hours.';
COMMENT ON COLUMN public.profiles.voicemail_greeting_mode IS 'Preferred voicemail greeting mode: ai_text or recorded.';
COMMENT ON COLUMN public.profiles.voicemail_greeting_text IS 'Text spoken when the Tradesman voicemail answers.';
COMMENT ON COLUMN public.profiles.voicemail_greeting_recording_url IS 'Hosted audio URL for a recorded voicemail greeting.';
COMMENT ON COLUMN public.profiles.voicemail_greeting_pin IS 'PIN used when calling in to record a voicemail greeting.';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_voicemail_greeting_pin_unique
  ON public.profiles (voicemail_greeting_pin)
  WHERE voicemail_greeting_pin IS NOT NULL AND btrim(voicemail_greeting_pin) <> '';
