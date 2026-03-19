-- ============================================================
-- Reset a demo user's portal_config every 12 hours (UTC: 00:00 and 12:00)
--
-- IMPORTANT — do NOT use CREATE EXTENSION here on Supabase.
-- Enabling pg_cron via SQL Editor often triggers internal scripts that fail with:
--   ERROR: dependent privileges exist (2BP01)
--
-- Instead:
-- 1) Supabase Dashboard → Database → Extensions → enable **pg_cron** (toggle only).
-- 2) Wait until it shows "Enabled" with no error.
-- 3) Run ONLY the sections below in SQL Editor (replace YOUR_DEMO_USER_UUID).
-- ============================================================

-- Optional: remove previous job with the same name (safe if none exists)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT jobid FROM cron.job WHERE jobname = 'reset_demo_portal_config')
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- Schedule (every 12 hours at :00 UTC — 00:00 and 12:00)
SELECT cron.schedule(
  'reset_demo_portal_config',
  '0 */12 * * *',
  $$
  UPDATE public.profiles
  SET
    portal_config = '{}'::jsonb,
    updated_at = now()
  WHERE id = 'YOUR_DEMO_USER_UUID'::uuid;
  $$
);

-- Verify
-- SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'reset_demo_portal_config';

-- ============================================================
-- Manual test (anytime)
-- ============================================================
-- UPDATE public.profiles
-- SET portal_config = '{}'::jsonb, updated_at = now()
-- WHERE id = 'YOUR_DEMO_USER_UUID'::uuid;
