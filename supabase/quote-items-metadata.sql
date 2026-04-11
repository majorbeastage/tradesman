-- Quote line items: metadata column (crew, min line, preset id, job type, line kind).
-- Run in Supabase SQL Editor if you see:
--   "Could not find the 'metadata' column of 'quote_items' in the schema cache"
--   or any error about quote_items.metadata on insert/update.
--
-- After running: Supabase Dashboard → Project Settings → API → click "Reload schema" (or wait ~1 min).

alter table if exists public.quote_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.quote_items.metadata is 'Optional: manpower (crew size), minimum_line_total, preset_id, job_type_id, line_kind';
