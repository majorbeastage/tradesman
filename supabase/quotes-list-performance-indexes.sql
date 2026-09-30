-- Speeds up Estimates list + customer linking queries (avoids statement timeouts).
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- The app no longer nests customers → customer_identifiers on the Estimates list.
-- These indexes still matter for the split list query and customer-profile quote lookups.

CREATE INDEX IF NOT EXISTS quotes_user_updated_at_idx
  ON public.quotes (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS quotes_user_active_updated_at_idx
  ON public.quotes (user_id, updated_at DESC)
  WHERE scheduled_at IS NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS quotes_customer_updated_at_idx
  ON public.quotes (customer_id, updated_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_identifiers_customer_id_idx
  ON public.customer_identifiers (customer_id);

CREATE INDEX IF NOT EXISTS customer_identifiers_customer_type_idx
  ON public.customer_identifiers (customer_id, type);

CREATE INDEX IF NOT EXISTS customer_identifiers_user_customer_idx
  ON public.customer_identifiers (user_id, customer_id);

CREATE INDEX IF NOT EXISTS customers_user_id_idx
  ON public.customers (user_id);

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
  ON public.messages (conversation_id, created_at DESC);

ANALYZE public.quotes;
ANALYZE public.customer_identifiers;
ANALYZE public.customers;
ANALYZE public.messages;
