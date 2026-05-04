-- ============================================================
-- SMS STOP / START opt-out per business (user_id) + customer phone
-- Run in Supabase SQL Editor. Required for inbound STOP handling + outbound blocks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_body text,
  last_message_sid text,
  UNIQUE (user_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_customer_sms_opt_outs_user_phone ON public.customer_sms_opt_outs (user_id, phone_e164);

COMMENT ON TABLE public.customer_sms_opt_outs IS 'When a customer texts STOP (etc.), outbound SMS to that number is blocked for that business user until START or manual delete.';

ALTER TABLE public.customer_sms_opt_outs ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated cannot read/write. Server API uses the service role key, which bypasses RLS.
