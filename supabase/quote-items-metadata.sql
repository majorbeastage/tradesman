-- Optional: add rich fields for quote line items (manpower, minimum bill, preset link).
-- Run in Supabase SQL Editor if quote_items exists without a metadata column.

alter table if exists public.quote_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.quote_items.metadata is 'Optional: manpower (crew size), minimum_line_total, preset_id, job_type_id, line_kind';
