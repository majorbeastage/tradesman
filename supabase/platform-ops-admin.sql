-- ============================================================
-- Platform ops admin gate + shared org structure RLS
-- Run in Supabase SQL Editor after supabase-profiles-roles.sql.
--
-- - is_platform_ops_admin(): role=admin AND email in justin@ / joe@
--   (or an active row in platform_admin_delegations)
-- - Tightens cross-tenant profile writes to platform ops only
-- - Lets managed users read (and, if Team Management grants edit, update)
--   their account owner's profile for shared org chart / workflow JSON
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_admin_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'structure'
    CHECK (scope IN ('structure', 'organization_chart', 'business_workflow', 'profiles')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grantee_user_id, scope)
);

ALTER TABLE public.platform_admin_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform ops manage delegations" ON public.platform_admin_delegations;
-- Policies for this table are applied after the function exists (below).

CREATE OR REPLACE FUNCTION public.is_platform_ops_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND lower(trim(coalesce(p.email, ''))) IN (
        'justin@tradesman-us.com',
        'joe@tradesman-us.com'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.platform_admin_delegations d
    WHERE d.grantee_user_id = auth.uid()
      AND d.scope IN ('structure', 'profiles', 'organization_chart', 'business_workflow')
  );
$$;

COMMENT ON FUNCTION public.is_platform_ops_admin() IS
  'True for justin@/joe@ platform admins, or users with an active platform_admin_delegations row.';

DROP POLICY IF EXISTS "Platform ops manage delegations" ON public.platform_admin_delegations;
CREATE POLICY "Platform ops manage delegations"
  ON public.platform_admin_delegations FOR ALL TO authenticated
  USING (public.is_platform_ops_admin())
  WITH CHECK (public.is_platform_ops_admin());

DROP POLICY IF EXISTS "Grantee can read own delegations" ON public.platform_admin_delegations;
CREATE POLICY "Grantee can read own delegations"
  ON public.platform_admin_delegations FOR SELECT TO authenticated
  USING (grantee_user_id = auth.uid());

-- Keep broad admin SELECT; restrict full write access to platform ops.
DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Platform ops admins full access profiles" ON public.profiles;
CREATE POLICY "Platform ops admins full access profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_platform_ops_admin())
  WITH CHECK (public.is_platform_ops_admin());

-- Managed team members can read the account owner profile (shared chart/workflow).
DROP POLICY IF EXISTS "Team members can read account owner profile" ON public.profiles;
CREATE POLICY "Team members can read account owner profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.user_id = auth.uid() AND omc.office_manager_id = profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_member_invites tmi
      WHERE tmi.shell_profile_id = auth.uid() AND tmi.account_owner_id = profiles.id
    )
  );

-- Delegates with Team Management edit flags may update the owner profile metadata.
DROP POLICY IF EXISTS "Delegates can update account owner structure profile" ON public.profiles;
CREATE POLICY "Delegates can update account owner structure profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.office_manager_clients omc
      JOIN public.profiles self ON self.id = auth.uid()
      WHERE omc.user_id = auth.uid()
        AND omc.office_manager_id = profiles.id
        AND (
          coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_organization_chart')::boolean, false)
          OR coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_business_workflow')::boolean, false)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.team_member_invites tmi
      JOIN public.profiles self ON self.id = auth.uid()
      WHERE tmi.shell_profile_id = auth.uid()
        AND tmi.account_owner_id = profiles.id
        AND (
          coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_organization_chart')::boolean, false)
          OR coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_business_workflow')::boolean, false)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.office_manager_clients omc
      JOIN public.profiles self ON self.id = auth.uid()
      WHERE omc.user_id = auth.uid()
        AND omc.office_manager_id = profiles.id
        AND (
          coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_organization_chart')::boolean, false)
          OR coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_business_workflow')::boolean, false)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.team_member_invites tmi
      JOIN public.profiles self ON self.id = auth.uid()
      WHERE tmi.shell_profile_id = auth.uid()
        AND tmi.account_owner_id = profiles.id
        AND (
          coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_organization_chart')::boolean, false)
          OR coalesce((self.metadata->'om_calendar_policy'->>'allow_edit_business_workflow')::boolean, false)
        )
    )
  );
