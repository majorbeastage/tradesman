-- Quote line items: metadata column (crew, min line, preset id, job type, line kind).
-- If inserts fail with errors about "metadata" or unknown column, run this in Supabase SQL Editor.

alter table if exists public.quote_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.quote_items.metadata is 'Optional: manpower (crew size), minimum_line_total, preset_id, job_type_id, line_kind';
