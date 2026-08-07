-- FIX: statement timeout on customers / view-as after team-member-org-rls.sql
-- Run in Supabase SQL Editor immediately (safe to re-run).
--
-- Causes:
-- 1) Team-member FOR ALL policies duplicated SELECT checks (read + write policies).
-- 2) is_managed_team_member_of() ran for admins on every row (admins already pass is_admin()).
-- 3) Admins could not read team_member_invites client-side for org roster.

CREATE OR REPLACE FUNCTION public.is_managed_team_member_of(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.is_admin()
    AND p_owner_id IS NOT NULL
    AND public.get_account_owner_id_for_auth_user() = p_owner_id;
$$;

DROP POLICY IF EXISTS "Admins read team_member_invites" ON public.team_member_invites;
CREATE POLICY "Admins read team_member_invites"
  ON public.team_member_invites FOR SELECT TO authenticated
  USING (public.is_admin());

-- Customers: split write policy off SELECT
DROP POLICY IF EXISTS "Team members write org customers" ON public.customers;
CREATE POLICY "Team members insert org customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members update org customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members delete org customers"
  ON public.customers FOR DELETE TO authenticated
  USING (public.is_managed_team_member_of(user_id));

-- Customer identifiers
DROP POLICY IF EXISTS "Team members write org customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Team members insert org customer_identifiers"
  ON public.customer_identifiers FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members update org customer_identifiers"
  ON public.customer_identifiers FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members delete org customer_identifiers"
  ON public.customer_identifiers FOR DELETE TO authenticated
  USING (public.is_managed_team_member_of(user_id));

-- Conversations
DROP POLICY IF EXISTS "Team members write org conversations" ON public.conversations;
CREATE POLICY "Team members insert org conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members update org conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members delete org conversations"
  ON public.conversations FOR DELETE TO authenticated
  USING (public.is_managed_team_member_of(user_id));

-- Quotes
DROP POLICY IF EXISTS "Team members write org quotes" ON public.quotes;
CREATE POLICY "Team members insert org quotes"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members update org quotes"
  ON public.quotes FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members delete org quotes"
  ON public.quotes FOR DELETE TO authenticated
  USING (public.is_managed_team_member_of(user_id));

-- Job types
DROP POLICY IF EXISTS "Team members write org job_types" ON public.job_types;
CREATE POLICY "Team members insert org job_types"
  ON public.job_types FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members update org job_types"
  ON public.job_types FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));
CREATE POLICY "Team members delete org job_types"
  ON public.job_types FOR DELETE TO authenticated
  USING (public.is_managed_team_member_of(user_id));

-- Communication events (optional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'communication_events') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Team members write org communication_events" ON public.communication_events;
      CREATE POLICY "Team members insert org communication_events"
        ON public.communication_events FOR INSERT TO authenticated
        WITH CHECK (public.is_managed_team_member_of(user_id));
      CREATE POLICY "Team members update org communication_events"
        ON public.communication_events FOR UPDATE TO authenticated
        USING (public.is_managed_team_member_of(user_id))
        WITH CHECK (public.is_managed_team_member_of(user_id));
      CREATE POLICY "Team members delete org communication_events"
        ON public.communication_events FOR DELETE TO authenticated
        USING (public.is_managed_team_member_of(user_id));
    $p$;
  END IF;
END $$;

-- Calendar preferences (optional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_calendar_preferences') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Team members write org user_calendar_preferences" ON public.user_calendar_preferences;
      CREATE POLICY "Team members insert org user_calendar_preferences"
        ON public.user_calendar_preferences FOR INSERT TO authenticated
        WITH CHECK (public.is_managed_team_member_of(owner_user_id));
      CREATE POLICY "Team members update org user_calendar_preferences"
        ON public.user_calendar_preferences FOR UPDATE TO authenticated
        USING (public.is_managed_team_member_of(owner_user_id))
        WITH CHECK (public.is_managed_team_member_of(owner_user_id));
      CREATE POLICY "Team members delete org user_calendar_preferences"
        ON public.user_calendar_preferences FOR DELETE TO authenticated
        USING (public.is_managed_team_member_of(owner_user_id));
    $p$;
  END IF;
END $$;
