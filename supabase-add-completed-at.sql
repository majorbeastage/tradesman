-- Run in Supabase SQL Editor if you see "column calendar_events.completed_at does not exist".
-- This enables the Complete button on calendar events and filters completed events from the calendar view.

ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
