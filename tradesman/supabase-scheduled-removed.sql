-- Run in Supabase SQL Editor.
-- Adds: quote scheduled/removed, calendar quote_total/removed, leads/convos removed.
-- Replace UUID with your DEV_USER_ID if your RLS uses it.

-- Quotes: when scheduled (added to calendar) and when user clicks Remove
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Calendar events: store quote total for display; support Remove (soft delete)
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS quote_total NUMERIC;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Leads: Remove action (will be logged to Customers later)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Conversations: Remove action
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Calendar: Complete action (completed events count as archived for Customers)
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
