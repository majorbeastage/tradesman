-- Add/repair profiles.email in existing projects.
-- Run in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill from auth.users where missing.
UPDATE public.profiles p
SET email = u.email,
    updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR btrim(p.email) = '');
