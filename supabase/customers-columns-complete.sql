-- Run once in Supabase SQL Editor if you see errors like:
--   column customers.service_address does not exist
--   column customers.best_contact_method does not exist
-- Idempotent: safe to re-run.

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS service_address text,
  ADD COLUMN IF NOT EXISTS service_lat double precision,
  ADD COLUMN IF NOT EXISTS service_lng double precision;

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS best_contact_method text,
  ADD COLUMN IF NOT EXISTS job_pipeline_status text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

COMMENT ON COLUMN public.customers.service_address IS 'Single-line or multi-line service / job site address (shown in leads, quotes, conversations, calendar).';
COMMENT ON COLUMN public.customers.service_lat IS 'Optional WGS84 latitude for maps (set manually or via geocode).';
COMMENT ON COLUMN public.customers.service_lng IS 'Optional WGS84 longitude for maps.';
COMMENT ON COLUMN public.customers.best_contact_method IS 'Preferred outbound channel label (e.g. Email, Text message, Phone call); may default from first contact.';
COMMENT ON COLUMN public.customers.job_pipeline_status IS 'High-level job / sales stage for the hub table.';
COMMENT ON COLUMN public.customers.last_activity_at IS 'Last meaningful update time for this customer (manual or derived).';
