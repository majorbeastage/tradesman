-- Service radius on profiles (for future lead / AI matching). Safe to run more than once.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS service_radius_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_radius_miles NUMERIC(8, 2);

COMMENT ON COLUMN public.profiles.service_radius_enabled IS 'When true, service_radius_miles limits how far the business serves (UI + future automation).';
COMMENT ON COLUMN public.profiles.service_radius_miles IS 'Maximum service distance in miles from business address.';
