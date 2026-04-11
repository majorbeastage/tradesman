-- Optional: default job type for a quote (customer / estimate context).
-- Run in Supabase SQL Editor if quotes has no job_type_id column.

alter table if exists public.quotes
  add column if not exists job_type_id uuid references public.job_types (id) on delete set null;

comment on column public.quotes.job_type_id is 'Optional default job type for this quote; new line items can inherit it when metadata allows.';
