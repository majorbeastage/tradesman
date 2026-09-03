-- New customers get Last update = the moment they were added.
-- Safe to re-run.

ALTER TABLE IF EXISTS public.customers
  ALTER COLUMN last_activity_at SET DEFAULT now();

UPDATE public.customers
SET last_activity_at = COALESCE(created_at, updated_at, now())
WHERE last_activity_at IS NULL;
