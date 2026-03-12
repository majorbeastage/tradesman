-- Run in Supabase Dashboard → SQL Editor if you need to create quotes / quote_items or RLS.
-- You already have quotes and quote_items in the table editor; use this for RLS only if needed.
-- Replace the UUID with your DEV_USER_ID if different.

-- Optional: create quotes if not present
-- CREATE TABLE IF NOT EXISTS public.quotes (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL,
--   customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
--   conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
--   status TEXT DEFAULT 'draft',
--   created_at TIMESTAMPTZ DEFAULT now(),
--   updated_at TIMESTAMPTZ DEFAULT now()
-- );

-- Optional: create quote_items if not present (quote_id, description, quantity, unit_price)
-- CREATE TABLE IF NOT EXISTS public.quote_items (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
--   description TEXT,
--   quantity NUMERIC DEFAULT 1,
--   unit_price NUMERIC DEFAULT 0,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );

-- ========== RUN THIS BLOCK IN SUPABASE SQL EDITOR ==========
-- Fixes: "new row violates row-level security policy for table quotes"

-- 1) Allow anon to use quotes for your dev user (replace UUID if your DEV_USER_ID is different)
DROP POLICY IF EXISTS "Allow anon quotes for dev user" ON public.quotes;
CREATE POLICY "Allow anon quotes for dev user"
ON public.quotes FOR ALL TO anon
USING (user_id = '00000000-0000-0000-0000-000000000001')
WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

-- 2) If quote_items has RLS enabled, run this too (so you can add line items)
DROP POLICY IF EXISTS "Allow anon quote_items for dev quotes" ON public.quote_items;
CREATE POLICY "Allow anon quote_items for dev quotes"
ON public.quote_items FOR ALL TO anon
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.user_id = '00000000-0000-0000-0000-000000000001')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.user_id = '00000000-0000-0000-0000-000000000001')
);
-- ========== END ==========
