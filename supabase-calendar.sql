-- Run in Supabase Dashboard → SQL Editor.
-- Replace the UUID with your DEV_USER_ID if different.

-- Job types: description, duration, custom color (used when adding calendar events)
CREATE TABLE IF NOT EXISTS public.job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER DEFAULT 60,
  color_hex TEXT DEFAULT '#F97316',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.job_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon job_types for dev user" ON public.job_types;
CREATE POLICY "Allow anon job_types for dev user"
ON public.job_types FOR ALL TO anon
USING (user_id = '00000000-0000-0000-0000-000000000001')
WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

-- Calendar events (can link to quote/customer when added from Quotes)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  job_type_id UUID REFERENCES public.job_types(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon calendar_events for dev user" ON public.calendar_events;
CREATE POLICY "Allow anon calendar_events for dev user"
ON public.calendar_events FOR ALL TO anon
USING (user_id = '00000000-0000-0000-0000-000000000001')
WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
