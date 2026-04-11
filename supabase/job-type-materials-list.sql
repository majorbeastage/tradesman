-- Materials checklist: default on job type, per-event copy on calendar_events (editable on the event).
-- Run in Supabase SQL Editor once.

ALTER TABLE IF EXISTS public.job_types
  ADD COLUMN IF NOT EXISTS materials_list TEXT;

ALTER TABLE IF EXISTS public.calendar_events
  ADD COLUMN IF NOT EXISTS materials_list TEXT;

COMMENT ON COLUMN public.job_types.materials_list IS 'Default materials (one line per item). Copied to new calendar events when a job type is chosen.';
COMMENT ON COLUMN public.calendar_events.materials_list IS 'Materials for this occurrence; editable. If null, UI may show job type default as reference.';
