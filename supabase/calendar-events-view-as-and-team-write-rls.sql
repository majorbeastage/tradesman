-- Calendar RLS: admin view-as + office manager delegation + team member writes.
-- Safe to re-run. Does NOT touch customers or other org SELECT policies.
--
-- Run after emergency-revert-team-member-rls.sql if team calendar inserts fail with RLS errors.
-- Also ensures platform admins can read/write any calendar while view-as previewing clients.

-- Core owner / admin / office-manager policy (from supabase-office-manager-rls.sql)
DROP POLICY IF EXISTS "Allow authenticated own calendar_events" ON public.calendar_events;
CREATE POLICY "Allow authenticated own calendar_events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = calendar_events.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = calendar_events.user_id
    )
  );

-- Team members schedule on the account owner calendar (INSERT/UPDATE only — no heavy org SELECT).
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

DROP POLICY IF EXISTS "Team members write org calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Team members update org calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Team members insert org calendar_events" ON public.calendar_events;

CREATE POLICY "Team members insert org calendar_events"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (public.is_managed_team_member_of(user_id));

CREATE POLICY "Team members update org calendar_events"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (public.is_managed_team_member_of(user_id))
  WITH CHECK (public.is_managed_team_member_of(user_id));

-- Assignee / video invitee reads (idempotent)
DROP POLICY IF EXISTS "calendar_events_read_assignee_invitee" ON public.calendar_events;
CREATE POLICY "calendar_events_read_assignee_invitee"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (
    (
      metadata->>'assigned_user_id' IS NOT NULL
      AND (metadata->>'assigned_user_id')::uuid = auth.uid()
    )
    OR (
      metadata->'video_call_v1'->'inviteeUserIds' IS NOT NULL
      AND (metadata->'video_call_v1'->'inviteeUserIds') @> jsonb_build_array(auth.uid()::text)
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.office_manager_clients omc
        WHERE omc.user_id = auth.uid()
          AND omc.office_manager_id = calendar_events.user_id
          AND (calendar_events.metadata->>'assigned_user_id')::uuid = auth.uid()
      )
    )
  );
