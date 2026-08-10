-- FIX: infinite recursion detected in policy for relation "profiles"
-- Run in Supabase SQL Editor immediately (safe to re-run).
--
-- Cause: "Org members read same client profiles" queried profiles inside
-- its own RLS policy. Fix: SECURITY DEFINER helper bypasses RLS for lookup.

CREATE OR REPLACE FUNCTION public.profile_shares_auth_user_client(p_profile_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_profile_client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.client_id IS NOT NULL
        AND me.client_id = p_profile_client_id
    );
$$;

DROP POLICY IF EXISTS "Org members read same client profiles" ON public.profiles;
CREATE POLICY "Org members read same client profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.profile_shares_auth_user_client(client_id));
