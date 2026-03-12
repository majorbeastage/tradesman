-- Run this ENTIRE script in Supabase: SQL Editor → New query → Paste → Run
-- Creates calendar_events and job_types. Replace the UUID if your DEV_USER_ID is different.

-- 1) Job types table
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

-- 2) Calendar events table (requires: public.quotes and public.customers to exist for FKs)
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

-- If step 2 failed (e.g. "relation public.quotes does not exist"), run the commented block in a NEW query:
-- DROP TABLE IF EXISTS public.calendar_events;
-- CREATE TABLE public.calendar_events (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL,
--   title TEXT NOT NULL,
--   start_at TIMESTAMPTZ NOT NULL,
--   end_at TIMESTAMPTZ NOT NULL,
--   job_type_id UUID REFERENCES public.job_types(id) ON DELETE SET NULL,
--   quote_id UUID,
--   customer_id UUID,
--   notes TEXT,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );
-- ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow anon calendar_events for dev user" ON public.calendar_events FOR ALL TO anon
-- USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
