-- FIX: infinite recursion detected in policy for relation "office_manager_clients"
-- Run in Supabase SQL Editor immediately (safe to re-run).
--
-- Cause: "Org members read office_manager_clients roster" queried the same table
-- inside its own RLS policy. Fix: SECURITY DEFINER helpers bypass RLS for lookups.

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

DROP POLICY IF EXISTS "Org members read office_manager_clients roster" ON public.office_manager_clients;
CREATE POLICY "Org members read office_manager_clients roster"
  ON public.office_manager_clients FOR SELECT TO authenticated
  USING (
    office_manager_id = auth.uid()
    OR user_id = auth.uid()
    OR office_manager_id = public.get_account_owner_id_for_auth_user()
  );
