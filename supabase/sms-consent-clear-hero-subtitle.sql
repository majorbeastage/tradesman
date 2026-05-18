-- Clear SMS consent hero subtitle (and optional notice card) stored in platform_settings.
-- Run in Supabase SQL Editor if /sms still shows old header copy after deploy.
-- Safe to re-run.

UPDATE public.platform_settings
SET value = COALESCE(value, '{}'::jsonb)
  || jsonb_build_object('subtitle', '', 'notice_title', '', 'notice_body', '')
WHERE key = 'tradesman_sms_consent';
