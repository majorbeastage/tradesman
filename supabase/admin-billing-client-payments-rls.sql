-- Admin → Billing & Helcim: read customer collection rows for any profile.
-- Run in Supabase SQL Editor (optional if Vercel /api/payment-requests?__action=admin-client-payments is used).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_requests') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Admins read payment_requests" ON public.payment_requests;
      CREATE POLICY "Admins read payment_requests"
        ON public.payment_requests FOR SELECT TO authenticated
        USING (public.is_admin());
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_payment_events') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Admins read customer_payment_events" ON public.customer_payment_events;
      CREATE POLICY "Admins read customer_payment_events"
        ON public.customer_payment_events FOR SELECT TO authenticated
        USING (public.is_admin());
    $p$;
  END IF;
END $$;
