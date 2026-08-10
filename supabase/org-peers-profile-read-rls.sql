-- ============================================================
-- Org peer discovery: same-client profile reads
-- Run after supabase-profiles-roles.sql / supabase-office-manager-rls.sql
--
-- Lets org members list peers who share client_id (org chart, calendar
-- assign dropdown, share contact) without granting cross-tenant writes.
-- Admins still have full access via is_admin().
-- ============================================================

DROP POLICY IF EXISTS "Org members read same client profiles" ON public.profiles;
CREATE POLICY "Org members read same client profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.client_id IS NOT NULL
        AND me.client_id = profiles.client_id
    )
  );
