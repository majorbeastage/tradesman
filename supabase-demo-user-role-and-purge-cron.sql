-- =============================================================================
-- Demo user role + automatic data purge (Supabase)
-- =============================================================================
-- 1) Adds profiles.role = 'demo_user' (alongside user, new_user, office_manager, admin).
-- 2) SECURITY DEFINER functions wipe CRM data + reset portal/calendar prefs for every
--    row where role = 'demo_user'. Does NOT delete auth users, profiles row, Twilio channels,
--    or storage files.
--
-- Schedule (pick one after enabling pg_cron in Dashboard → Database → Extensions):
--   - Every 2 hours:  0 */2 * * *
--   - Every hour:     0 * * * *
--
-- Do NOT run CREATE EXTENSION pg_cron here; enable the extension in the Dashboard only.
-- =============================================================================

-- Role constraint (include all roles your project uses)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'new_user', 'demo_user', 'office_manager', 'admin'));

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'demo_user: full-app trial; run purge_all_demo_users() on a schedule to reset data.';

-- -----------------------------------------------------------------------------
-- Per-user purge (only runs when role is still demo_user)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_demo_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'demo_user'
  ) THEN
    RETURN;
  END IF;

  IF to_regclass('public.client_external_access_logs') IS NOT NULL THEN
    DELETE FROM public.client_external_access_logs WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.communication_events WHERE user_id = p_user_id;

  DELETE FROM public.messages
  WHERE conversation_id IN (
    SELECT id FROM public.conversations WHERE user_id = p_user_id
  );

  DELETE FROM public.conversations WHERE user_id = p_user_id;

  DELETE FROM public.quote_items
  WHERE quote_id IN (SELECT id FROM public.quotes WHERE user_id = p_user_id);

  DELETE FROM public.quotes WHERE user_id = p_user_id;

  DELETE FROM public.calendar_events WHERE user_id = p_user_id;

  DELETE FROM public.leads WHERE user_id = p_user_id;

  DELETE FROM public.customer_identifiers WHERE user_id = p_user_id;

  DELETE FROM public.customers WHERE user_id = p_user_id;

  DELETE FROM public.job_types WHERE user_id = p_user_id;

  -- Portal: empty object → app falls back to default tab set from client template
  UPDATE public.profiles
  SET
    portal_config = '{}'::jsonb,
    updated_at = now()
  WHERE id = p_user_id AND role = 'demo_user';

  IF to_regclass('public.user_calendar_preferences') IS NOT NULL THEN
    INSERT INTO public.user_calendar_preferences (owner_user_id, ribbon_color, auto_assign_enabled, created_at, updated_at)
    VALUES (p_user_id, NULL, true, now(), now())
    ON CONFLICT (owner_user_id) DO UPDATE SET
      ribbon_color = EXCLUDED.ribbon_color,
      auto_assign_enabled = EXCLUDED.auto_assign_enabled,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Purge all demo accounts (intended for pg_cron)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_all_demo_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE role = 'demo_user'
  LOOP
    PERFORM public.purge_demo_user_data(r.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_demo_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_all_demo_users() FROM PUBLIC;

-- Optional: allow service_role to run manually from SQL / tooling
GRANT EXECUTE ON FUNCTION public.purge_demo_user_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_all_demo_users() TO service_role;

-- -----------------------------------------------------------------------------
-- pg_cron job (every 2 hours at :00 UTC). Uncomment after extension is enabled.
-- -----------------------------------------------------------------------------
-- Remove prior job with same name if re-running this section:
-- DO $$
-- DECLARE
--   r RECORD;
-- BEGIN
--   FOR r IN (SELECT jobid FROM cron.job WHERE jobname = 'purge_demo_users')
--   LOOP
--     PERFORM cron.unschedule(r.jobid);
--   END LOOP;
-- END $$;
--
-- SELECT cron.schedule(
--   'purge_demo_users',
--   '0 */2 * * *',
--   $$SELECT public.purge_all_demo_users();$$
-- );
--
-- Verify: SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'purge_demo_users';
-- Manual test: SELECT public.purge_all_demo_users();
