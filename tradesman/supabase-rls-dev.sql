-- Run this in Supabase Dashboard → SQL Editor to fix "connection failed"
-- when the app can reach Supabase but RLS blocks the request.
--
-- This allows the anon key to SELECT rows for your dev user.
-- Replace the UUID with your DEV_USER_ID if different.

-- Allow anon to SELECT from customers (for connection check and app)
CREATE POLICY "Allow anon select customers for dev user"
ON public.customers FOR SELECT
TO anon
USING (user_id = '00000000-0000-0000-0000-000000000001');

-- If you still get errors on other tables, add similar policies, e.g.:
-- CREATE POLICY "Allow anon select leads for dev user"
-- ON public.leads FOR SELECT TO anon
-- USING (user_id = '00000000-0000-0000-0000-000000000001');
--
-- Optional: for "Add Lead to my Conversations" (lead is removed from Leads list):
-- ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
-- Then add RLS policy to allow anon to UPDATE leads for your dev user if needed.

-- Allow anon to UPDATE customers (e.g. for saving notes). Run the following.
-- This allows any customer row to be updated (dev only). If you prefer to restrict by user_id, use Option B below instead.
DROP POLICY IF EXISTS "Allow anon update customers dev" ON public.customers;
CREATE POLICY "Allow anon update customers dev"
ON public.customers FOR UPDATE TO anon
USING (true) WITH CHECK (true);

-- Option B: If your customers table HAS user_id, drop Option A and run this instead
-- (replace the UUID with your DEV_USER_ID):
-- DROP POLICY IF EXISTS "Allow anon update customers dev" ON public.customers;
-- CREATE POLICY "Allow anon update customers for dev user"
-- ON public.customers FOR UPDATE TO anon
-- USING (user_id = '00000000-0000-0000-0000-000000000001')
-- WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
