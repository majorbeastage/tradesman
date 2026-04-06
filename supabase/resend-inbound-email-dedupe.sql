-- Optional: dedupe Resend `email.received` webhooks so corporate Zoho forwards are not
-- sent twice when Resend retries. Used by api/incoming-email.ts when
-- RESEND_ZOHO_FORWARD_JSON is set. Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.resend_inbound_email_ids (
  email_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.resend_inbound_email_ids ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.resend_inbound_email_ids IS 'Dedupe Resend inbound webhook deliveries; service role bypasses RLS.';
