-- RUN NOW in Supabase → SQL Editor (safe to re-run).
-- Fixes slow / recursive profiles RLS that stalls login (`select metadata from profiles where id = …`).

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

REVOKE ALL ON FUNCTION public.profile_shares_auth_user_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_shares_auth_user_client(uuid) TO authenticated;

DROP POLICY IF EXISTS "Org members read same client profiles" ON public.profiles;
CREATE POLICY "Org members read same client profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.profile_shares_auth_user_client(client_id));

-- Ensure self-read is always cheap and present (own row by PK).
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Drop any legacy peer policy that queried profiles inside profiles RLS.
DROP POLICY IF EXISTS "Users can read peers in same org" ON public.profiles;
DROP POLICY IF EXISTS "Team members read org profiles" ON public.profiles;
