-- Run in Supabase SQL Editor: workflow status + last-update timestamp for Leads.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'New';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.leads SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

COMMENT ON COLUMN public.leads.status IS 'New, Contacted, Qualified, Lost — editable in app; AI may suggest updates when configured.';
COMMENT ON COLUMN public.leads.updated_at IS 'Set by app on edits; use for Last update column.';
