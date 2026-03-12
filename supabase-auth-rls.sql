-- ============================================================
-- AUTH + RLS: Login portal – each user sees only their own data
-- Run this in Supabase SQL Editor AFTER enabling Auth (see SUPABASE-AUTH-SETUP.md).
-- These policies allow authenticated users to access rows where user_id = auth.uid().
-- ============================================================

-- Customers
DROP POLICY IF EXISTS "Allow authenticated own customers" ON public.customers;
CREATE POLICY "Allow authenticated own customers"
  ON public.customers FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Customer identifiers
DROP POLICY IF EXISTS "Allow authenticated own customer_identifiers" ON public.customer_identifiers;
CREATE POLICY "Allow authenticated own customer_identifiers"
  ON public.customer_identifiers FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Conversations
DROP POLICY IF EXISTS "Allow authenticated own conversations" ON public.conversations;
CREATE POLICY "Allow authenticated own conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Leads
DROP POLICY IF EXISTS "Allow authenticated own leads" ON public.leads;
CREATE POLICY "Allow authenticated own leads"
  ON public.leads FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Quotes
DROP POLICY IF EXISTS "Allow authenticated own quotes" ON public.quotes;
CREATE POLICY "Allow authenticated own quotes"
  ON public.quotes FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Quote items (access via parent quote's user_id)
DROP POLICY IF EXISTS "Allow authenticated own quote_items" ON public.quote_items;
CREATE POLICY "Allow authenticated own quote_items"
  ON public.quote_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid())
  );

-- Calendar events
DROP POLICY IF EXISTS "Allow authenticated own calendar_events" ON public.calendar_events;
CREATE POLICY "Allow authenticated own calendar_events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Job types
DROP POLICY IF EXISTS "Allow authenticated own job_types" ON public.job_types;
CREATE POLICY "Allow authenticated own job_types"
  ON public.job_types FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Activities (if table exists and has user_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activities') THEN
    DROP POLICY IF EXISTS "Allow authenticated own activities" ON public.activities;
    CREATE POLICY "Allow authenticated own activities"
      ON public.activities FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Done. Users can now sign in and only see their own data.
