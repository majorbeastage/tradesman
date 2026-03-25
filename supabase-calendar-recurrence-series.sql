-- Links materialized recurring calendar rows so users can remove one instance or the whole series.
-- Run in Supabase SQL Editor after calendar_events exists.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID;

CREATE INDEX IF NOT EXISTS idx_calendar_events_recurrence_series
  ON public.calendar_events (recurrence_series_id)
  WHERE recurrence_series_id IS NOT NULL AND removed_at IS NULL;

COMMENT ON COLUMN public.calendar_events.recurrence_series_id IS
  'Shared id for rows created as one recurring series; null for single events or legacy rows.';
