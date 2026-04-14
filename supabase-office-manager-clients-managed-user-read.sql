-- Managed contractors: allow reading own row in office_manager_clients (RLS).
-- Used by the app to detect "assigned to an office manager" and default-hide the Payments tab until enabled in User portal tabs.
-- Run in Supabase SQL Editor after supabase-profiles-roles.sql / supabase-office-manager-rls.sql.

DROP POLICY IF EXISTS "Managed users can read own office_manager link" ON public.office_manager_clients;
CREATE POLICY "Managed users can read own office_manager link"
  ON public.office_manager_clients
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
