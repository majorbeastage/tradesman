-- Speeds up Estimates list + customer linking queries (avoids statement timeouts).
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.

CREATE INDEX IF NOT EXISTS quotes_user_updated_at_idx
  ON public.quotes (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS quotes_user_active_updated_at_idx
  ON public.quotes (user_id, updated_at DESC)
  WHERE scheduled_at IS NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS quotes_customer_updated_at_idx
  ON public.quotes (customer_id, updated_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
  ON public.messages (conversation_id, created_at DESC);

ANALYZE public.quotes;
ANALYZE public.messages;
