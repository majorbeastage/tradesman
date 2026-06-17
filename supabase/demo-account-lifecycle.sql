-- Demo account lifecycle: activation window + purge helpers.
-- Run in Supabase SQL Editor after onboarding-platform.sql.

ALTER TABLE public.demo_access_grants
  ADD COLUMN IF NOT EXISTS activate_by timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

COMMENT ON COLUMN public.demo_access_grants.activate_by IS
  'Delete auth user if activated_at is still null after this time (default 8h from grant).';
COMMENT ON COLUMN public.demo_access_grants.activated_at IS
  'First successful login; expires_at is extended to activated_at + 24h.';
COMMENT ON COLUMN public.demo_access_grants.expires_at IS
  'Before activation: same as activate_by. After activation: end of 24h demo session.';

-- Wipe CRM data for any trial/demo profile (office_manager demo or legacy demo_user).
CREATE OR REPLACE FUNCTION public.purge_trial_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (
        p.role = 'demo_user'
        OR (p.portal_config->>'demo_account')::boolean IS TRUE
        OR (p.metadata->>'demo_account')::boolean IS TRUE
      )
  ) THEN
    RETURN;
  END IF;

  IF to_regclass('public.client_external_access_logs') IS NOT NULL THEN
    DELETE FROM public.client_external_access_logs WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.communication_events WHERE user_id = p_user_id;

  DELETE FROM public.messages
  WHERE conversation_id IN (SELECT id FROM public.conversations WHERE user_id = p_user_id);

  DELETE FROM public.conversations WHERE user_id = p_user_id;

  DELETE FROM public.quote_items
  WHERE quote_id IN (SELECT id FROM public.quotes WHERE user_id = p_user_id);

  DELETE FROM public.quotes WHERE user_id = p_user_id;
  DELETE FROM public.calendar_events WHERE user_id = p_user_id;
  DELETE FROM public.leads WHERE user_id = p_user_id;
  DELETE FROM public.customer_identifiers WHERE user_id = p_user_id;
  DELETE FROM public.customers WHERE user_id = p_user_id;
  DELETE FROM public.job_types WHERE user_id = p_user_id;

  IF to_regclass('public.user_time_clock_sessions') IS NOT NULL THEN
    DELETE FROM public.user_time_clock_sessions WHERE user_id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_trial_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_trial_user_data(uuid) TO service_role;

-- Optional pg_cron (enable extension in Dashboard first):
-- SELECT cron.schedule(
--   'purge_expired_demos',
--   '15 * * * *',
--   $$SELECT net.http_post(
--     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/purge-expired-demos',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-tradesman-purge-demos-secret', 'YOUR_SECRET'
--     ),
--     body := '{}'::jsonb
--   );$$
-- );
