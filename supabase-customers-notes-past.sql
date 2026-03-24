-- Append-only history for customer notes (current notes stay on customers.notes).
-- Run in Supabase SQL Editor after customers table exists.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notes_past JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customers.notes_past IS 'Array of { text, saved_at } entries archived from working notes.';
