-- Customers hub: best contact, job pipeline stage, last activity (run in Supabase SQL Editor).
ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS best_contact_method text,
  ADD COLUMN IF NOT EXISTS job_pipeline_status text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

COMMENT ON COLUMN public.customers.best_contact_method IS 'Preferred outbound channel label (e.g. Email, Text message, Phone call); may default from first contact.';
COMMENT ON COLUMN public.customers.job_pipeline_status IS 'High-level job / sales stage for the hub table.';
COMMENT ON COLUMN public.customers.last_activity_at IS 'Last meaningful update time for this customer (manual or derived).';
