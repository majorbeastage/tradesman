-- Customers hub — communication urgency (row-level + sortable). Run in Supabase SQL Editor after `customers` exists.

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS communication_urgency text;

COMMENT ON COLUMN public.customers.communication_urgency IS
  'Workflow urgency for the Customers hub: In Process, Needs Attention, Priority, Complete, Lost. Distinct from job_pipeline_status.';

-- Optional: default for new rows (application also normalizes null → In Process).
UPDATE public.customers
SET communication_urgency = 'In Process'
WHERE communication_urgency IS NULL OR trim(communication_urgency) = '';
