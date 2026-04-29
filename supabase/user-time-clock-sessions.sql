-- ============================================================
-- Time clock: one open session per user (profile / auth user).
-- Users clock themselves in/out while authenticated.
-- Office managers can SELECT open sessions for linked roster users.
-- Run in Supabase SQL Editor after other auth/office_manager setup.
-- Future: kiosk / shared device can use Edge Function + service role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_time_clock_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clocked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clocked_out_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_time_clock_sessions_out_after_in CHECK (clocked_out_at IS NULL OR clocked_out_at >= clocked_in_at)
);

-- At most one open (unclosed) session per user
CREATE UNIQUE INDEX IF NOT EXISTS user_time_clock_sessions_one_open_per_user
  ON public.user_time_clock_sessions (user_id)
  WHERE (clocked_out_at IS NULL);

CREATE INDEX IF NOT EXISTS user_time_clock_sessions_user_open_lookup
  ON public.user_time_clock_sessions (user_id)
  WHERE (clocked_out_at IS NULL);

ALTER TABLE public.user_time_clock_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_time_clock_sessions_select" ON public.user_time_clock_sessions;
CREATE POLICY "user_time_clock_sessions_select"
  ON public.user_time_clock_sessions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid()
        AND omc.user_id = user_time_clock_sessions.user_id
    )
  );

DROP POLICY IF EXISTS "user_time_clock_sessions_insert" ON public.user_time_clock_sessions;
CREATE POLICY "user_time_clock_sessions_insert"
  ON public.user_time_clock_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "user_time_clock_sessions_update" ON public.user_time_clock_sessions;
CREATE POLICY "user_time_clock_sessions_update"
  ON public.user_time_clock_sessions FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin()
    OR user_id = auth.uid()
  );

COMMENT ON TABLE public.user_time_clock_sessions IS 'Clock in/out per auth user; clocked_out_at null means currently clocked in.';
