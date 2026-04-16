-- Mobile push device tokens + last-known GPS for team map (run in Supabase SQL Editor).
-- Deploy Edge Functions: push-test, twilio-bridge-call, notify-quote-status, notify-calendar-status
-- Secrets: FCM_SERVICE_ACCOUNT_JSON (Firebase service account JSON for FCM HTTP v1), RESEND_* , TWILIO_*

-- ---------------------------------------------------------------------------
-- user_push_devices: FCM/APNs registration tokens per device
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS user_push_devices_user_id_idx ON public.user_push_devices (user_id);

ALTER TABLE public.user_push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_push_devices_select_own"
  ON public.user_push_devices FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "user_push_devices_insert_own"
  ON public.user_push_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "user_push_devices_update_own"
  ON public.user_push_devices FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "user_push_devices_delete_own"
  ON public.user_push_devices FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.user_push_devices IS 'Capacitor push registration tokens; used by push-test, notify-quote-status, and notify-calendar-status Edge Functions.';

-- ---------------------------------------------------------------------------
-- user_last_locations: one row per user (upsert from mobile when GPS opt-in on)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_last_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_last_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_last_locations_select_self_or_team"
  ON public.user_last_locations FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = (SELECT auth.uid())
        AND omc.user_id = user_last_locations.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid()) AND pr.role = 'admin'
    )
  );

CREATE POLICY "user_last_locations_insert_own"
  ON public.user_last_locations FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "user_last_locations_update_own"
  ON public.user_last_locations FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.user_last_locations IS 'Last GPS fix from opted-in mobile users; office managers and admins can read managed team rows.';
