-- ============================================================
-- JOB TYPES: Table + RLS so "Add job type" works
-- Run this in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- ============================================================

-- 1) Create job_types table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER DEFAULT 60,
  color_hex TEXT DEFAULT '#F97316',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1b) If table already existed without these columns, add them now
ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS color_hex TEXT DEFAULT '#F97316';
ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2) Enable RLS
ALTER TABLE public.job_types ENABLE ROW LEVEL SECURITY;

-- 3) Drop old policies (by name) so we can add the right ones
DROP POLICY IF EXISTS "Allow anon job_types for dev user" ON public.job_types;
DROP POLICY IF EXISTS "Allow authenticated own job_types" ON public.job_types;

-- 4a) Signed-in users: full access to their own rows
CREATE POLICY "Allow authenticated own job_types"
  ON public.job_types FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4b) Anonymous (dev/local): allow when user_id = dev UUID so "Add job type" works without login
CREATE POLICY "Allow anon job_types for dev user"
  ON public.job_types FOR ALL TO anon
  USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Done. "Add job type" should work both when signed in and when using the app without login (dev user).
