-- Mileage on calendar events; optional "track mileage" on job types (shows mileage field on events).
-- Run in Supabase SQL Editor once.

ALTER TABLE IF EXISTS public.job_types
  ADD COLUMN IF NOT EXISTS track_mileage BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.calendar_events
  ADD COLUMN IF NOT EXISTS mileage_miles NUMERIC;

COMMENT ON COLUMN public.job_types.track_mileage IS 'When true, calendar events with this job type show a mileage field.';
COMMENT ON COLUMN public.calendar_events.mileage_miles IS 'Optional miles logged for this job (when job type tracks mileage).';
