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
