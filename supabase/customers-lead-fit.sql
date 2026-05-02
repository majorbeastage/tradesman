-- Customer hub — lead fit (hot / maybe / bad), mirrors leads.fit_* for Customers-only workflows.
-- Run in Supabase SQL Editor after public.customers exists.

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS fit_classification text CHECK (fit_classification IS NULL OR fit_classification IN ('hot', 'maybe', 'bad')),
  ADD COLUMN IF NOT EXISTS fit_confidence double precision,
  ADD COLUMN IF NOT EXISTS fit_reason text,
  ADD COLUMN IF NOT EXISTS fit_source text,
  ADD COLUMN IF NOT EXISTS fit_manually_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fit_evaluated_at timestamptz;

COMMENT ON COLUMN public.customers.fit_classification IS 'Lead-style fit for customer hub: hot, maybe, bad (rules-first).';
COMMENT ON COLUMN public.customers.fit_reason IS 'Short explanation shown in Customers tab.';
COMMENT ON COLUMN public.customers.fit_source IS 'rules | ai | hybrid | manual';
