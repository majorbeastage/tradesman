-- Team members (managed users + invite shells) can read/write their account owner's org data.
-- Run in Supabase SQL Editor after supabase-office-manager-rls.sql and
-- supabase-office-manager-clients-managed-user-read.sql.
--
-- Office managers already access managed users via office_manager_id = auth.uid().
-- This adds the inverse: user_id = auth.uid() → office_manager_id owns the row.

-- SECURITY DEFINER lookups avoid RLS recursion on office_manager_clients.
CREATE OR REPLACE FUNCTION public.get_account_owner_id_for_auth_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT omc.office_manager_id
      FROM public.office_manager_clients omc
      WHERE omc.user_id = auth.uid()
      ORDER BY omc.office_manager_id
      LIMIT 1
    ),
    (
      SELECT tmi.account_owner_id
      FROM public.team_member_invites tmi
      WHERE tmi.shell_profile_id = auth.uid()
        AND tmi.status IN ('accepted', 'shell', 'pending')
      ORDER BY tmi.created_at DESC
      LIMIT 1
    )
  );
$$;

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

-- Invite shells + account owners + admins can read relevant invite rows.
DROP POLICY IF EXISTS "Admins read team_member_invites" ON public.team_member_invites;
CREATE POLICY "Admins read team_member_invites"
  ON public.team_member_invites FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS "Team invite shell read own invite" ON public.team_member_invites;
CREATE POLICY "Team invite shell read own invite"
  ON public.team_member_invites FOR SELECT TO authenticated
  USING (shell_profile_id = auth.uid());

DROP POLICY IF EXISTS "Account owner read team invites" ON public.team_member_invites;
CREATE POLICY "Account owner read team invites"
  ON public.team_member_invites FOR SELECT TO authenticated
  USING (account_owner_id = auth.uid());

DROP POLICY IF EXISTS "Org members read office_manager_clients roster" ON public.office_manager_clients;
CREATE POLICY "Org members read office_manager_clients roster"
  ON public.office_manager_clients FOR SELECT TO authenticated
  USING (
    office_manager_id = auth.uid()
    OR user_id = auth.uid()
    OR office_manager_id = public.get_account_owner_id_for_auth_user()
  );

-- Customers
DROP POLICY IF EXISTS "Team members read org customers" ON public.customers;
CREATE POLICY "Team members read org customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

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
DROP POLICY IF EXISTS "Team members read org customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Team members read org customer_identifiers"
  ON public.customer_identifiers FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

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
DROP POLICY IF EXISTS "Team members read org conversations" ON public.conversations;
CREATE POLICY "Team members read org conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

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

-- Communication events (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'communication_events') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Team members read org communication_events" ON public.communication_events;
      CREATE POLICY "Team members read org communication_events"
        ON public.communication_events FOR SELECT TO authenticated
        USING (public.is_managed_team_member_of(user_id));
    $p$;
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

-- Quotes / estimates
DROP POLICY IF EXISTS "Team members read org quotes" ON public.quotes;
CREATE POLICY "Team members read org quotes"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

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

-- Calendar events (owner calendar rows + assignee reads via calendar-events-invitee-rls.sql)
DROP POLICY IF EXISTS "Team members read org calendar_events" ON public.calendar_events;
CREATE POLICY "Team members read org calendar_events"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members write org calendar_events" ON public.calendar_events;
CREATE POLICY "Team members write org calendar_events"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members update org calendar_events" ON public.calendar_events;
CREATE POLICY "Team members update org calendar_events"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

-- Job types
DROP POLICY IF EXISTS "Team members read org job_types" ON public.job_types;
CREATE POLICY "Team members read org job_types"
  ON public.job_types FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

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

-- Calendar preferences (optional table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_calendar_preferences') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Team members read org user_calendar_preferences" ON public.user_calendar_preferences;
      CREATE POLICY "Team members read org user_calendar_preferences"
        ON public.user_calendar_preferences FOR SELECT TO authenticated
        USING (public.is_managed_team_member_of(owner_user_id));
    $p$;
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
