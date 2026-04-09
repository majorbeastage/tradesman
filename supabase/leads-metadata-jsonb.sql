-- Pending AI consumer auto-replies and other lead-scoped JSON (e.g. automation flags).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.leads.metadata IS 'JSON: e.g. pending_ai_consumer_reply when AI auto-response requires user approval before send.';
