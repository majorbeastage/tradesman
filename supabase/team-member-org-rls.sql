-- Team members (managed users + invite shells) can read/write their account owner's org data.
-- Run in Supabase SQL Editor after supabase-office-manager-rls.sql and
-- supabase-office-manager-clients-managed-user-read.sql.
--
-- Office managers already access managed users via office_manager_id = auth.uid().
-- This adds the inverse: user_id = auth.uid() → office_manager_id owns the row.

CREATE OR REPLACE FUNCTION public.is_managed_team_member_of(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p_owner_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.office_manager_clients omc
        WHERE omc.user_id = auth.uid()
          AND omc.office_manager_id = p_owner_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.team_member_invites tmi
        WHERE tmi.shell_profile_id = auth.uid()
          AND tmi.account_owner_id = p_owner_id
          AND tmi.status IN ('accepted', 'shell', 'pending')
      )
    );
$$;

-- Invite shells + account owners can read relevant invite rows (org roster resolution).
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
    EXISTS (
      SELECT 1
      FROM public.office_manager_clients mine
      WHERE mine.user_id = auth.uid()
        AND mine.office_manager_id = office_manager_clients.office_manager_id
    )
    OR office_manager_id = auth.uid()
  );

-- Customers
DROP POLICY IF EXISTS "Team members read org customers" ON public.customers;
CREATE POLICY "Team members read org customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members write org customers" ON public.customers;
CREATE POLICY "Team members write org customers"
  ON public.customers FOR ALL TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

-- Customer identifiers
DROP POLICY IF EXISTS "Team members read org customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Team members read org customer_identifiers"
  ON public.customer_identifiers FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members write org customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Team members write org customer_identifiers"
  ON public.customer_identifiers FOR ALL TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

-- Conversations
DROP POLICY IF EXISTS "Team members read org conversations" ON public.conversations;
CREATE POLICY "Team members read org conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members write org conversations" ON public.conversations;
CREATE POLICY "Team members write org conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

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
      CREATE POLICY "Team members write org communication_events"
        ON public.communication_events FOR ALL TO authenticated
        USING (public.is_managed_team_member_of(user_id))
        WITH CHECK (public.is_managed_team_member_of(user_id));
    $p$;
  END IF;
END $$;

-- Quotes / estimates
DROP POLICY IF EXISTS "Team members read org quotes" ON public.quotes;
CREATE POLICY "Team members read org quotes"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members write org quotes" ON public.quotes;
CREATE POLICY "Team members write org quotes"
  ON public.quotes FOR ALL TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

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
CREATE POLICY "Team members write org job_types"
  ON public.job_types FOR ALL TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

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
      CREATE POLICY "Team members write org user_calendar_preferences"
        ON public.user_calendar_preferences FOR ALL TO authenticated
        USING (public.is_managed_team_member_of(owner_user_id))
        WITH CHECK (public.is_managed_team_member_of(owner_user_id));
    $p$;
  END IF;
END $$;
