-- Public marketing site traffic (page views logged by /api/site-traffic).
-- Run in Supabase SQL Editor. Inserts use service role from Vercel; admins read via RLS.

CREATE TABLE IF NOT EXISTS public.site_traffic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  path TEXT NOT NULL,
  view_key TEXT NOT NULL,
  referrer TEXT,
  referrer_host TEXT,
  user_agent TEXT,
  country TEXT,
  hour_utc SMALLINT,
  day_utc DATE NOT NULL,
  visitor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS site_traffic_events_occurred_at_idx ON public.site_traffic_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS site_traffic_events_day_utc_idx ON public.site_traffic_events (day_utc DESC);
CREATE INDEX IF NOT EXISTS site_traffic_events_referrer_host_idx ON public.site_traffic_events (referrer_host);

COMMENT ON TABLE public.site_traffic_events IS 'Anonymous marketing-site page views for Admin → Site traffic.';

ALTER TABLE public.site_traffic_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select site_traffic_events" ON public.site_traffic_events;
CREATE POLICY "Admins select site_traffic_events"
  ON public.site_traffic_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
