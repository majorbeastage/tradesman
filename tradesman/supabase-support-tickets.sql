-- ============================================================
-- Support tickets for Web Support & Tech Support forms
-- Run in Supabase SQL Editor. Ticket numbers are auto-generated (WEB-00001, TECH-00001).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('web', 'tech')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Sequences for ticket numbers (WEB-00001, TECH-00001)
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_web_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_tech_seq START 1;

-- Trigger: set ticket_number on insert
CREATE OR REPLACE FUNCTION public.support_ticket_set_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'web' THEN
    NEW.ticket_number := 'WEB-' || lpad(nextval('public.support_ticket_web_seq')::text, 5, '0');
  ELSIF NEW.type = 'tech' THEN
    NEW.ticket_number := 'TECH-' || lpad(nextval('public.support_ticket_tech_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_ticket_set_number_trigger ON public.support_tickets;
CREATE TRIGGER support_ticket_set_number_trigger
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION public.support_ticket_set_number();

-- If ticket_number is supplied we don't override (allows manual override). So we need to always set when empty.
-- Fix: trigger runs when NEW.ticket_number is null. But we're inserting without ticket_number, so it's null. Good.
-- For inserts that omit ticket_number, the trigger sets it. So the app should insert without ticket_number.

COMMENT ON TABLE public.support_tickets IS 'Web and tech support form submissions; ticket_number is WEB-00001 or TECH-00001.';

-- RLS: allow anyone to submit (anon INSERT), and to read for portal (anon SELECT)
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert support_tickets" ON public.support_tickets;
CREATE POLICY "Allow anon insert support_tickets"
  ON public.support_tickets FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select support_tickets" ON public.support_tickets;
CREATE POLICY "Allow anon select support_tickets"
  ON public.support_tickets FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow authenticated select support_tickets" ON public.support_tickets;
CREATE POLICY "Allow authenticated select support_tickets"
  ON public.support_tickets FOR SELECT TO authenticated USING (true);
