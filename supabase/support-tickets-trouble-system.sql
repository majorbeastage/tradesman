-- Trouble ticket system extensions: demo + phone (help desk), notes, extra fields.
-- Run in Supabase SQL Editor after supabase-support-tickets.sql

-- New sequences for ticket numbers
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_demo_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_phone_seq START 1;

-- Relax NOT NULL so phone-created tickets can omit email / use placeholders
ALTER TABLE public.support_tickets ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.support_tickets ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.support_tickets ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_type_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_type_check
  CHECK (type IN ('web', 'tech', 'demo', 'phone'));

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS transcription TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS recording_sid TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS call_from_phone TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS preferred_contact TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_recording_sid_key ON public.support_tickets (recording_sid) WHERE recording_sid IS NOT NULL AND recording_sid <> '';

CREATE TABLE IF NOT EXISTS public.support_ticket_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket_id_idx ON public.support_ticket_notes (ticket_id);

COMMENT ON TABLE public.support_ticket_notes IS 'Threaded notes for support/trouble tickets (admin replies, transcripts, system).';

CREATE OR REPLACE FUNCTION public.support_ticket_set_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NOT NULL AND NEW.ticket_number <> '' THEN
    RETURN NEW;
  END IF;
  IF NEW.type = 'web' THEN
    NEW.ticket_number := 'WEB-' || lpad(nextval('public.support_ticket_web_seq')::text, 5, '0');
  ELSIF NEW.type = 'tech' THEN
    NEW.ticket_number := 'TECH-' || lpad(nextval('public.support_ticket_tech_seq')::text, 5, '0');
  ELSIF NEW.type = 'demo' THEN
    NEW.ticket_number := 'DEMO-' || lpad(nextval('public.support_ticket_demo_seq')::text, 5, '0');
  ELSIF NEW.type = 'phone' THEN
    NEW.ticket_number := 'CALL-' || lpad(nextval('public.support_ticket_phone_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Notes RLS (admin portal uses authenticated Supabase client)
ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select support_ticket_notes" ON public.support_ticket_notes;
CREATE POLICY "Allow authenticated select support_ticket_notes"
  ON public.support_ticket_notes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert support_ticket_notes" ON public.support_ticket_notes;
CREATE POLICY "Allow authenticated insert support_ticket_notes"
  ON public.support_ticket_notes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert support_ticket_notes" ON public.support_ticket_notes;
CREATE POLICY "Allow anon insert support_ticket_notes"
  ON public.support_ticket_notes FOR INSERT TO anon WITH CHECK (true);

-- Optional: let authenticated admins read all tickets (if not already)
DROP POLICY IF EXISTS "Allow authenticated insert support_tickets" ON public.support_tickets;
CREATE POLICY "Allow authenticated insert support_tickets"
  ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (true);
