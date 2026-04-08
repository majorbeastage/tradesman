-- =============================================================================
-- Tradesman: support tickets + notes (ONE script — run in Supabase SQL Editor)
-- Fixes: "Could not find the table 'public.support_tickets' in the schema cache"
-- After running: Dashboard → Project Settings → API → click "Reload" / wait ~1 min
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_web_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_tech_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_demo_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_phone_seq START 1;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  business_name TEXT,
  title TEXT,
  transcription TEXT,
  recording_url TEXT,
  twilio_call_sid TEXT,
  recording_sid TEXT,
  call_from_phone TEXT,
  preferred_contact TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open'
);

-- Upgrade older rows that still have NOT NULL on legacy columns (safe if already nullable)
ALTER TABLE public.support_tickets ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.support_tickets ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.support_tickets ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS transcription TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS recording_sid TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS call_from_phone TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS preferred_contact TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority IN ('low', 'medium', 'normal', 'high'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'resolved', 'cancelled'));

-- Widen type enum for existing databases (web/tech only → + demo/phone)
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_type_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_type_check
  CHECK (type IN ('web', 'tech', 'demo', 'phone'));

DROP TRIGGER IF EXISTS support_ticket_set_number_trigger ON public.support_tickets;

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

CREATE TRIGGER support_ticket_set_number_trigger
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION public.support_ticket_set_number();

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_recording_sid_key
  ON public.support_tickets (recording_sid)
  WHERE recording_sid IS NOT NULL AND btrim(recording_sid) <> '';

CREATE TABLE IF NOT EXISTS public.support_ticket_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket_id_idx ON public.support_ticket_notes (ticket_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert support_tickets" ON public.support_tickets;
CREATE POLICY "Allow anon insert support_tickets"
  ON public.support_tickets FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select support_tickets" ON public.support_tickets;
CREATE POLICY "Allow anon select support_tickets"
  ON public.support_tickets FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow authenticated select support_tickets" ON public.support_tickets;
CREATE POLICY "Allow authenticated select support_tickets"
  ON public.support_tickets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert support_tickets" ON public.support_tickets;
CREATE POLICY "Allow authenticated insert support_tickets"
  ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins update support_tickets" ON public.support_tickets;
CREATE POLICY "Admins update support_tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete support_tickets" ON public.support_tickets;
CREATE POLICY "Admins delete support_tickets"
  ON public.support_tickets FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Allow authenticated select support_ticket_notes" ON public.support_ticket_notes;
CREATE POLICY "Allow authenticated select support_ticket_notes"
  ON public.support_ticket_notes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert support_ticket_notes" ON public.support_ticket_notes;
CREATE POLICY "Allow authenticated insert support_ticket_notes"
  ON public.support_ticket_notes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert support_ticket_notes" ON public.support_ticket_notes;
CREATE POLICY "Allow anon insert support_ticket_notes"
  ON public.support_ticket_notes FOR INSERT TO anon WITH CHECK (true);

COMMENT ON TABLE public.support_tickets IS 'Trouble tickets: web, tech, demo, help-desk phone.';
COMMENT ON TABLE public.support_ticket_notes IS 'Notes / transcript lines per ticket.';
