-- Team members can READ calendar events they are assigned to or invited to (video/conference).
-- Run in Supabase SQL Editor after supabase-office-manager-rls.sql and calendar-events-metadata.sql.
-- Does not grant write — assignee edits still go through the account owner row.

DROP POLICY IF EXISTS "calendar_events_read_assignee_invitee" ON public.calendar_events;
CREATE POLICY "calendar_events_read_assignee_invitee"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (
    (metadata->>'assigned_user_id')::uuid = auth.uid()
    OR (
      metadata->'video_call_v1'->'inviteeUserIds' IS NOT NULL
      AND (metadata->'video_call_v1'->'inviteeUserIds') @> jsonb_build_array(auth.uid()::text)
    )
  );
