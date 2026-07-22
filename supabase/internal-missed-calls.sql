-- Missed internal team calls (audio / video) for Tradesman Messaging.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.internal_missed_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  callee_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  caller_name text,
  video boolean NOT NULL DEFAULT false,
  room_id text,
  status text NOT NULL DEFAULT 'missed'
    CHECK (status IN ('missed', 'declined', 'canceled')),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_missed_calls_callee_created_idx
  ON public.internal_missed_calls (callee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_missed_calls_callee_unseen_idx
  ON public.internal_missed_calls (callee_id)
  WHERE seen_at IS NULL AND status = 'missed';

ALTER TABLE public.internal_missed_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_missed_calls_select_own ON public.internal_missed_calls;
CREATE POLICY internal_missed_calls_select_own
  ON public.internal_missed_calls FOR SELECT TO authenticated
  USING (callee_id = (SELECT auth.uid()) OR caller_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS internal_missed_calls_insert_caller ON public.internal_missed_calls;
CREATE POLICY internal_missed_calls_insert_caller
  ON public.internal_missed_calls FOR INSERT TO authenticated
  WITH CHECK (caller_id = (SELECT auth.uid()) OR callee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS internal_missed_calls_update_callee ON public.internal_missed_calls;
CREATE POLICY internal_missed_calls_update_callee
  ON public.internal_missed_calls FOR UPDATE TO authenticated
  USING (callee_id = (SELECT auth.uid()))
  WITH CHECK (callee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS internal_missed_calls_delete_callee ON public.internal_missed_calls;
CREATE POLICY internal_missed_calls_delete_callee
  ON public.internal_missed_calls FOR DELETE TO authenticated
  USING (callee_id = (SELECT auth.uid()));

COMMENT ON TABLE public.internal_missed_calls IS
  'Unanswered (or declined) internal WebRTC team calls for Messenger missed-call UI.';
