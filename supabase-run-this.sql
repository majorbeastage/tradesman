-- ============================================================
-- RUN THIS ENTIRE FILE IN SUPABASE (Dashboard → SQL Editor → New query → Paste → Run)
-- This adds the columns the app needs so Remove, Send to Quotes, Create Lead → Quotes, and Complete work.
-- ============================================================

-- 1) Conversations: so "Remove" and "Send to Quotes" persist (conversation leaves the list)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
--    JSON for portal field values, read receipts (fixes PGRST204 if metadata was missing)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Quotes: so draft quotes show in Quotes tab and scheduled/removed filtering works
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- 3) Leads: for Remove action and "Add to Conversations" (mark converted)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- 4) Calendar: quote total on events, Remove, and Complete button
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS quote_total NUMERIC;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_series_id UUID;

-- 5) RLS: Allow SELECT, INSERT, UPDATE, DELETE for your dev user (so new leads show in Leads tab, etc.).
--    Replace the UUID with your app's DEV_USER_ID if different (see tradesman/src/core/dev.ts).

-- Conversations (Remove / Send to Quotes persist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
    DROP POLICY IF EXISTS "Allow anon conversations for dev user" ON public.conversations;
    CREATE POLICY "Allow anon conversations for dev user"
      ON public.conversations FOR ALL TO anon
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
    DROP POLICY IF EXISTS "Allow authenticated conversations for dev user" ON public.conversations;
    CREATE POLICY "Allow authenticated conversations for dev user"
      ON public.conversations FOR ALL TO authenticated
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
  END IF;
END $$;

-- Leads (new leads show in Leads tab after Create Lead)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leads') THEN
    DROP POLICY IF EXISTS "Allow anon leads for dev user" ON public.leads;
    CREATE POLICY "Allow anon leads for dev user"
      ON public.leads FOR ALL TO anon
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
    DROP POLICY IF EXISTS "Allow authenticated leads for dev user" ON public.leads;
    CREATE POLICY "Allow authenticated leads for dev user"
      ON public.leads FOR ALL TO authenticated
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
  END IF;
END $$;

-- Customers (required so Leads tab can show customer name when loading leads)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers') THEN
    DROP POLICY IF EXISTS "Allow anon customers for dev user" ON public.customers;
    CREATE POLICY "Allow anon customers for dev user"
      ON public.customers FOR ALL TO anon
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
    DROP POLICY IF EXISTS "Allow authenticated customers for dev user" ON public.customers;
    CREATE POLICY "Allow authenticated customers for dev user"
      ON public.customers FOR ALL TO authenticated
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
  END IF;
END $$;

-- Customer_identifiers (required so Leads tab can show phone etc. when loading leads)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_identifiers') THEN
    DROP POLICY IF EXISTS "Allow anon customer_identifiers for dev user" ON public.customer_identifiers;
    CREATE POLICY "Allow anon customer_identifiers for dev user"
      ON public.customer_identifiers FOR ALL TO anon
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
    DROP POLICY IF EXISTS "Allow authenticated customer_identifiers for dev user" ON public.customer_identifiers;
    CREATE POLICY "Allow authenticated customer_identifiers for dev user"
      ON public.customer_identifiers FOR ALL TO authenticated
      USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
      WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
  END IF;
END $$;

-- Done. Reload your app; new leads should appear in the Leads tab after Create Lead.

-- ============================================================
-- 6) Profiles: deactivate users (no login) without deleting data; default tabs for new_user signups
--    Run after profiles exists. Keeps auth user; app signs out when account_disabled = true.
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_disabled BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.account_disabled IS 'When true, user cannot use the app; rows and history stay.';

-- New auth users: new_user + limited portal tabs (Dashboard, Account, Tech Support). Sync with getDefaultPortalConfigForNewUser in src/types/portal-builder.ts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, portal_config, account_disabled)
  VALUES (
    NEW.id,
    NEW.email,
    'new_user',
    '{"tabs": {"dashboard": true, "leads": false, "conversations": false, "quotes": false, "calendar": false, "customers": false, "account": true, "web-support": false, "tech-support": true, "settings": false}}'::jsonb,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: backfill new_user rows that have empty portal_config only (does not overwrite custom admin configs)
UPDATE public.profiles p
SET portal_config = '{"tabs": {"dashboard": true, "leads": false, "conversations": false, "quotes": false, "calendar": false, "customers": false, "account": true, "web-support": false, "tech-support": true, "settings": false}}'::jsonb,
    updated_at = now()
WHERE p.role = 'new_user'
  AND (p.portal_config IS NULL OR p.portal_config = '{}'::jsonb OR (p.portal_config->'tabs') IS NULL);
