-- Hair Plumbing / large shops: canceling statement due to statement timeout (57014)
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Causes:
-- 1) Nested customer_identifiers embed + RLS evaluated per row.
-- 2) Team-member SELECT policy used is_managed_team_member_of(user_id) (not index-friendly).
-- 3) Missing (user_id, updated_at) indexes.

CREATE INDEX IF NOT EXISTS customers_user_id_updated_at_idx
  ON public.customers (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS customers_user_id_idx
  ON public.customers (user_id);

CREATE INDEX IF NOT EXISTS customer_identifiers_user_id_idx
  ON public.customer_identifiers (user_id);

CREATE INDEX IF NOT EXISTS customer_identifiers_customer_id_idx
  ON public.customer_identifiers (customer_id);

CREATE INDEX IF NOT EXISTS quotes_user_id_customer_id_idx
  ON public.quotes (user_id, customer_id);

CREATE INDEX IF NOT EXISTS leads_user_id_customer_id_idx
  ON public.leads (user_id, customer_id);

CREATE INDEX IF NOT EXISTS conversations_user_id_customer_id_idx
  ON public.conversations (user_id, customer_id);

CREATE INDEX IF NOT EXISTS calendar_events_user_id_customer_id_idx
  ON public.calendar_events (user_id, customer_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'communication_events') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS communication_events_user_created_idx ON public.communication_events (user_id, created_at DESC)';
  END IF;
END $$;

-- Initplan auth lookups so Postgres can use customers_user_id_* indexes.
-- Team members: user_id = account owner (one computation, then index match).
DROP POLICY IF EXISTS "Allow authenticated own customers" ON public.customers;
CREATE POLICY "Allow authenticated own customers"
  ON public.customers FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR COALESCE((SELECT public.is_admin()), false)
    OR user_id = (SELECT public.get_account_owner_id_for_auth_user())
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = (SELECT auth.uid())
        AND omc.user_id = customers.user_id
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR COALESCE((SELECT public.is_admin()), false)
    OR user_id = (SELECT public.get_account_owner_id_for_auth_user())
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = (SELECT auth.uid())
        AND omc.user_id = customers.user_id
    )
  );

-- Redundant and slow: OR of is_managed_team_member_of(user_id) blocks index use.
DROP POLICY IF EXISTS "Team members read org customers" ON public.customers;

DROP POLICY IF EXISTS "Allow authenticated own customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Allow authenticated own customer_identifiers"
  ON public.customer_identifiers FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR COALESCE((SELECT public.is_admin()), false)
    OR user_id = (SELECT public.get_account_owner_id_for_auth_user())
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = (SELECT auth.uid())
        AND omc.user_id = customer_identifiers.user_id
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR COALESCE((SELECT public.is_admin()), false)
    OR user_id = (SELECT public.get_account_owner_id_for_auth_user())
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = (SELECT auth.uid())
        AND omc.user_id = customer_identifiers.user_id
    )
  );

DROP POLICY IF EXISTS "Team members read org customer_identifiers" ON public.customer_identifiers;

ANALYZE public.customers;
ANALYZE public.customer_identifiers;
