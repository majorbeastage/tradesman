-- Run in Supabase SQL editor if needed: allow draft estimates without a linked customer.
-- Estimates Tool opens a blank workspace quote until the user picks a customer (except when opened from Customers with prefill).

ALTER TABLE public.quotes
  ALTER COLUMN customer_id DROP NOT NULL;

-- Optional: ensure FK still allows NULL (default on nullable columns).
