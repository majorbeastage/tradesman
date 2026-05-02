-- Estimates Library: active vs archived (run in Supabase SQL Editor).
-- Active estimate ≈ linked to a customer who is not archived, and the quote is not archived.

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS public.quotes
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.customers.archived_at IS 'When set, customer is treated as archived in hub / estimates library.';
COMMENT ON COLUMN public.quotes.archived_at IS 'When set, estimate is archived (e.g. completed job).';

CREATE INDEX IF NOT EXISTS quotes_user_archived_idx ON public.quotes (user_id, archived_at);
