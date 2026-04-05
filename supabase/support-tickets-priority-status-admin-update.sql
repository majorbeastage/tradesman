-- Add priority / status to support tickets and allow admins to update rows (Admin portal).
-- Run in Supabase SQL Editor after support_tickets already exists.

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

UPDATE public.support_tickets SET priority = 'normal' WHERE priority IS NULL OR trim(priority) NOT IN ('normal', 'high');
UPDATE public.support_tickets SET status = 'open' WHERE status IS NULL OR trim(status) NOT IN ('open', 'resolved', 'cancelled');

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority IN ('normal', 'high'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'resolved', 'cancelled'));

DROP POLICY IF EXISTS "Admins update support_tickets" ON public.support_tickets;
CREATE POLICY "Admins update support_tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON COLUMN public.support_tickets.priority IS 'normal | high';
COMMENT ON COLUMN public.support_tickets.status IS 'open | resolved | cancelled';
