-- Quotes + quote_items: admin view-as, account owners, and team member writes.
-- Safe to re-run. Fixes "new row violates row-level security policy for table quotes"
-- when platform admins or team members work in Estimates for another org user.

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

DROP POLICY IF EXISTS "Allow authenticated own quotes" ON public.quotes;
CREATE POLICY "Allow authenticated own quotes"
  ON public.quotes FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid()
        AND quotes.user_id IN (omc.office_manager_id, omc.user_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid()
        AND quotes.user_id IN (omc.office_manager_id, omc.user_id)
    )
  );

DROP POLICY IF EXISTS "Team members write org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members insert org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members update org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members delete org quotes" ON public.quotes;

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

DROP POLICY IF EXISTS "Allow authenticated own quote_items" ON public.quote_items;
CREATE POLICY "Allow authenticated own quote_items"
  ON public.quote_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
      AND (
        q.user_id = auth.uid()
        OR public.is_admin()
        OR public.is_managed_team_member_of(q.user_id)
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid()
            AND q.user_id IN (omc.office_manager_id, omc.user_id)
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
      AND (
        q.user_id = auth.uid()
        OR public.is_admin()
        OR public.is_managed_team_member_of(q.user_id)
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid()
            AND q.user_id IN (omc.office_manager_id, omc.user_id)
        )
      )
    )
  );
