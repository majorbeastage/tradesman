-- ============================================================
-- Office manager data access (run in Supabase SQL Editor)
--
-- After supabase-auth-rls.sql / supabase-profiles-roles.sql:
-- extends RLS so users listed in office_manager_clients for auth.uid()
-- can read/write that client's rows (same as that user's user_id).
-- Admins (is_admin()) keep full access via existing policies.
--
-- Assign links in Admin portal → Users table ("Office manager" column),
-- or insert into office_manager_clients manually.
-- ============================================================

-- Profiles: office managers need to read/update managed users (portal_config, client_id, etc.)
DROP POLICY IF EXISTS "Office managers read managed profiles" ON public.profiles;
CREATE POLICY "Office managers read managed profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "Office managers update managed profiles" ON public.profiles;
CREATE POLICY "Office managers update managed profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = profiles.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = profiles.id
    )
  );

-- Customers
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

-- Customer identifiers
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

-- Conversations
DROP POLICY IF EXISTS "Allow authenticated own conversations" ON public.conversations;
CREATE POLICY "Allow authenticated own conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = conversations.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = conversations.user_id
    )
  );

-- Leads
DROP POLICY IF EXISTS "Allow authenticated own leads" ON public.leads;
CREATE POLICY "Allow authenticated own leads"
  ON public.leads FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = leads.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = leads.user_id
    )
  );

-- Quotes
DROP POLICY IF EXISTS "Allow authenticated own quotes" ON public.quotes;
CREATE POLICY "Allow authenticated own quotes"
  ON public.quotes FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = quotes.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = quotes.user_id
    )
  );

-- Quote items
DROP POLICY IF EXISTS "Allow authenticated own quote_items" ON public.quote_items;
CREATE POLICY "Allow authenticated own quote_items"
  ON public.quote_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
      AND (
        q.user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid() AND omc.user_id = q.user_id
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
      AND (
        q.user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid() AND omc.user_id = q.user_id
        )
      )
    )
  );

-- Calendar events
DROP POLICY IF EXISTS "Allow authenticated own calendar_events" ON public.calendar_events;
CREATE POLICY "Allow authenticated own calendar_events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = calendar_events.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = calendar_events.user_id
    )
  );

-- Job types
DROP POLICY IF EXISTS "Allow authenticated own job_types" ON public.job_types;
CREATE POLICY "Allow authenticated own job_types"
  ON public.job_types FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = job_types.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = job_types.user_id
    )
  );

-- User calendar preferences (if created)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_calendar_preferences') THEN
    DROP POLICY IF EXISTS "Allow authenticated own user_calendar_preferences" ON public.user_calendar_preferences;
    CREATE POLICY "Allow authenticated own user_calendar_preferences"
      ON public.user_calendar_preferences FOR ALL TO authenticated
      USING (
        owner_user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid() AND omc.user_id = user_calendar_preferences.owner_user_id
        )
      )
      WITH CHECK (
        owner_user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid() AND omc.user_id = user_calendar_preferences.owner_user_id
        )
      );
  END IF;
END $$;

-- Activities (optional table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activities') THEN
    DROP POLICY IF EXISTS "Allow authenticated own activities" ON public.activities;
    CREATE POLICY "Allow authenticated own activities"
      ON public.activities FOR ALL TO authenticated
      USING (
        user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid() AND omc.user_id = activities.user_id
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.office_manager_clients omc
          WHERE omc.office_manager_id = auth.uid() AND omc.user_id = activities.user_id
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.office_manager_clients IS 'Links office_manager_id to user_id (field user). Admins assign in Admin → Users; RLS uses this for delegated access.';
