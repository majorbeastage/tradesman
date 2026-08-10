-- REQUIRED for team members (e.g. bhair@hairplumbing.com) to see jobs assigned to them.
-- Safe to run — does NOT add heavy org-wide policies (no customer timeouts).
-- Run in Supabase SQL Editor after emergency-revert-team-member-rls.sql if that was applied.
--
-- How assignments work in Tradesman:
-- - Manager (shair) saves calendar events on HER calendar (user_id = owner).
-- - Assignee is stored in metadata.assigned_user_id (e.g. bhair's user id).
-- - Team member calendar loads events where assigned_user_id = their auth uid.
-- - Org chart links people to nodes; scheduling assignee picker sets metadata on save.

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
