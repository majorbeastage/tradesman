-- Job details text for estimates (QuotesPage wizard + AI scope assistant).
-- Run in Supabase SQL Editor once. Safe to run multiple times.
ALTER TABLE IF EXISTS public.quotes
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quotes.metadata IS 'Optional JSON: e.g. job_details (free-text scope notes for estimates and AI).';
