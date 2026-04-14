-- Billing audit trail for Helcim (and other) payment webhooks.
-- Run in Supabase SQL Editor after deploying billing-webhook Edge Function.
-- RLS: no policies — only service role (Edge) can read/write.

CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  profile_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  amount_cents INTEGER,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'helcim',
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_billing_events_profile_id ON public.billing_events (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_external_id ON public.billing_events (external_id);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.billing_events IS 'Payment webhook audit; accessed via service role from billing-webhook Edge Function.';
