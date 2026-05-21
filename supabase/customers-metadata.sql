-- Per-customer JSON metadata (SMS opt-in, future flags). Idempotent.
ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customers.metadata IS 'App flags e.g. sms_consent { at, source, disclosure_snapshot } for A2P / compliance.';
