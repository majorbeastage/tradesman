-- ============================================================
-- User calendar preferences for office manager/admin scheduling
-- - per-user ribbon color shown on calendar event blocks
-- - per-user auto-assign toggle used by calendar + quotes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_calendar_preferences (
  owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ribbon_color TEXT,
  auto_assign_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_calendar_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated own user_calendar_preferences" ON public.user_calendar_preferences;
CREATE POLICY "Allow authenticated own user_calendar_preferences"
  ON public.user_calendar_preferences FOR ALL TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = user_calendar_preferences.owner_user_id
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = user_calendar_preferences.owner_user_id
    )
  );
