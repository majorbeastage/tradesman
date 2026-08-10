-- Org customer sharing: team members READ the account owner's customer data (SELECT only).
-- Safe to re-run. Does NOT re-add heavy org-wide SELECT duplication on write policies.
-- Run after emergency-revert-team-member-rls.sql removed team-member customer access.

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

DROP POLICY IF EXISTS "Team members read org customers" ON public.customers;
CREATE POLICY "Team members read org customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members read org customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Team members read org customer_identifiers"
  ON public.customer_identifiers FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members read org quotes" ON public.quotes;
CREATE POLICY "Team members read org quotes"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members read org leads" ON public.leads;
CREATE POLICY "Team members read org leads"
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DROP POLICY IF EXISTS "Team members read org conversations" ON public.conversations;
CREATE POLICY "Team members read org conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_managed_team_member_of(user_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'communication_events') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Team members read org communication_events" ON public.communication_events;
      CREATE POLICY "Team members read org communication_events"
        ON public.communication_events FOR SELECT TO authenticated
        USING (public.is_managed_team_member_of(user_id));
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_requests') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Team members read org payment_requests" ON public.payment_requests;
      CREATE POLICY "Team members read org payment_requests"
        ON public.payment_requests FOR SELECT TO authenticated
        USING (public.is_managed_team_member_of(user_id));
    $p$;
  END IF;
END $$;

DROP POLICY IF EXISTS "Team members read org quote_items" ON public.quote_items;
CREATE POLICY "Team members read org quote_items"
  ON public.quote_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND public.is_managed_team_member_of(q.user_id)
    )
  );
