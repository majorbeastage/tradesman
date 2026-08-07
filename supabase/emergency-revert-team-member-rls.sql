-- EMERGENCY: restore customer access for account owners (e.g. shair@hairplumbing.com)
-- Run this NOW in Supabase SQL Editor if Customers times out or shows empty after team-member-org-rls.sql.
-- Safe to re-run. Does NOT delete any customer data — only removes extra RLS policies.
--
-- After customers work again, you can re-apply team-member access later with fix-team-member-rls-performance.sql
-- (or wait for an updated team-member-org-rls.sql).

-- Customers
DROP POLICY IF EXISTS "Team members read org customers" ON public.customers;
DROP POLICY IF EXISTS "Team members write org customers" ON public.customers;
DROP POLICY IF EXISTS "Team members insert org customers" ON public.customers;
DROP POLICY IF EXISTS "Team members update org customers" ON public.customers;
DROP POLICY IF EXISTS "Team members delete org customers" ON public.customers;

-- Customer identifiers
DROP POLICY IF EXISTS "Team members read org customer_identifiers" ON public.customer_identifiers;
DROP POLICY IF EXISTS "Team members write org customer_identifiers" ON public.customer_identifiers;
DROP POLICY IF EXISTS "Team members insert org customer_identifiers" ON public.customer_identifiers;
DROP POLICY IF EXISTS "Team members update org customer_identifiers" ON public.customer_identifiers;
DROP POLICY IF EXISTS "Team members delete org customer_identifiers" ON public.customer_identifiers;

-- Conversations
DROP POLICY IF EXISTS "Team members read org conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team members write org conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team members insert org conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team members update org conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team members delete org conversations" ON public.conversations;

-- Quotes
DROP POLICY IF EXISTS "Team members read org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members write org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members insert org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members update org quotes" ON public.quotes;
DROP POLICY IF EXISTS "Team members delete org quotes" ON public.quotes;

-- Calendar events
DROP POLICY IF EXISTS "Team members read org calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Team members write org calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Team members update org calendar_events" ON public.calendar_events;

-- Job types
DROP POLICY IF EXISTS "Team members read org job_types" ON public.job_types;
DROP POLICY IF EXISTS "Team members write org job_types" ON public.job_types;
DROP POLICY IF EXISTS "Team members insert org job_types" ON public.job_types;
DROP POLICY IF EXISTS "Team members update org job_types" ON public.job_types;
DROP POLICY IF EXISTS "Team members delete org job_types" ON public.job_types;

-- Communication events
DROP POLICY IF EXISTS "Team members read org communication_events" ON public.communication_events;
DROP POLICY IF EXISTS "Team members write org communication_events" ON public.communication_events;
DROP POLICY IF EXISTS "Team members insert org communication_events" ON public.communication_events;
DROP POLICY IF EXISTS "Team members update org communication_events" ON public.communication_events;
DROP POLICY IF EXISTS "Team members delete org communication_events" ON public.communication_events;

-- Calendar preferences
DROP POLICY IF EXISTS "Team members read org user_calendar_preferences" ON public.user_calendar_preferences;
DROP POLICY IF EXISTS "Team members write org user_calendar_preferences" ON public.user_calendar_preferences;
DROP POLICY IF EXISTS "Team members insert org user_calendar_preferences" ON public.user_calendar_preferences;
DROP POLICY IF EXISTS "Team members update org user_calendar_preferences" ON public.user_calendar_preferences;
DROP POLICY IF EXISTS "Team members delete org user_calendar_preferences" ON public.user_calendar_preferences;

-- Optional: remove org roster policy (keeps "Managed users read own link" + OM policies)
DROP POLICY IF EXISTS "Org members read office_manager_clients roster" ON public.office_manager_clients;

-- Re-assert core owner policy (no-op if already present; fixes if accidentally dropped)
DROP POLICY IF EXISTS "Allow authenticated own customers" ON public.customers;
CREATE POLICY "Allow authenticated own customers"
  ON public.customers FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = customers.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = customers.user_id
    )
  );

DROP POLICY IF EXISTS "Allow authenticated own customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Allow authenticated own customer_identifiers"
  ON public.customer_identifiers FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = customer_identifiers.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = customer_identifiers.user_id
    )
  );
