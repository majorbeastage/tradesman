-- Optional job / service site on customer (team map, receipts, dispatch).
-- Run in Supabase SQL Editor when upgrading team map + address forms.

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS service_address text,
  ADD COLUMN IF NOT EXISTS service_lat double precision,
  ADD COLUMN IF NOT EXISTS service_lng double precision;

COMMENT ON COLUMN public.customers.service_address IS 'Single-line or multi-line service / job site address (shown in leads, quotes, conversations, calendar).';
COMMENT ON COLUMN public.customers.service_lat IS 'Optional WGS84 latitude for maps (set manually or via geocode).';
COMMENT ON COLUMN public.customers.service_lng IS 'Optional WGS84 longitude for maps.';
