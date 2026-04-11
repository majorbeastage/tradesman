-- Per-event JSON for receipt overrides and extra lines (run in Supabase SQL Editor).
-- Also run tradesman/supabase/job-type-materials-list.sql if calendar_events.materials_list is missing.

ALTER TABLE IF EXISTS public.calendar_events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.calendar_events.metadata IS
  'JSON: receipt_quote_overrides (per quote_item id), receipt_additional_lines (extra receipt rows).';
