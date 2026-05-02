-- Optional metadata for quote/calendar files (notes on photo, attach-to-customer-copy flag).
ALTER TABLE IF EXISTS public.entity_attachments
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.entity_attachments.metadata IS
  'App-defined JSON e.g. { "note": "...", "attach_to_customer_copy": true }';
