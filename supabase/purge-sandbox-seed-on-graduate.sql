-- Purge fictional sandbox CRM rows when a training account graduates to live.
-- Run in Supabase SQL Editor after demo-account-lifecycle.sql.

CREATE OR REPLACE FUNCTION public.purge_sandbox_seed_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_ids uuid[];
  v_quote_ids uuid[];
  v_event_ids uuid[];
  v_conv_ids uuid[];
  v_customers_removed integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.id), ARRAY[]::uuid[])
  INTO v_customer_ids
  FROM public.customers c
  WHERE c.user_id = p_user_id
    AND (
      COALESCE((c.metadata->>'sandbox_seed')::boolean, false)
      OR COALESCE((c.metadata->>'sandbox_live')::boolean, false)
      OR COALESCE((c.metadata->>'sandbox_promotional')::boolean, false)
      OR EXISTS (
        SELECT 1
        FROM public.customer_identifiers ci
        WHERE ci.user_id = p_user_id
          AND ci.customer_id = c.id
          AND ci.type = 'email'
          AND lower(ci.value) LIKE '%@example.invalid'
      )
    );

  SELECT COALESCE(array_agg(DISTINCT q.id), ARRAY[]::uuid[])
  INTO v_quote_ids
  FROM public.quotes q
  WHERE q.user_id = p_user_id
    AND (
      (q.customer_id IS NOT NULL AND q.customer_id = ANY (v_customer_ids))
      OR COALESCE((q.metadata->>'sandbox_seed')::boolean, false)
      OR COALESCE((q.metadata->>'sandbox_simulated')::boolean, false)
      OR COALESCE((q.metadata->>'sandbox_autopilot_seed')::boolean, false)
    );

  IF to_regclass('public.entity_attachments') IS NOT NULL AND cardinality(v_quote_ids) > 0 THEN
    DELETE FROM public.entity_attachments WHERE quote_id = ANY (v_quote_ids);
  END IF;

  IF cardinality(v_quote_ids) > 0 THEN
    DELETE FROM public.quote_items WHERE quote_id = ANY (v_quote_ids);
    DELETE FROM public.quotes WHERE id = ANY (v_quote_ids);
  END IF;

  DELETE FROM public.quote_items
  WHERE quote_id IN (
    SELECT id FROM public.quotes
    WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids)
  );
  DELETE FROM public.quotes
  WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids);

  SELECT COALESCE(array_agg(DISTINCT ce.id), ARRAY[]::uuid[])
  INTO v_event_ids
  FROM public.communication_events ce
  WHERE ce.user_id = p_user_id
    AND (
      (ce.customer_id IS NOT NULL AND ce.customer_id = ANY (v_customer_ids))
      OR COALESCE((ce.metadata->>'sandbox_seed')::boolean, false)
      OR COALESCE((ce.metadata->>'sandbox_simulated')::boolean, false)
      OR COALESCE((ce.metadata->>'sandbox_promotional')::boolean, false)
    );

  IF to_regclass('public.communication_attachments') IS NOT NULL AND cardinality(v_event_ids) > 0 THEN
    DELETE FROM public.communication_attachments
    WHERE communication_event_id = ANY (v_event_ids);
  END IF;

  IF cardinality(v_event_ids) > 0 THEN
    DELETE FROM public.communication_events WHERE id = ANY (v_event_ids);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT conv.id), ARRAY[]::uuid[])
  INTO v_conv_ids
  FROM public.conversations conv
  WHERE conv.user_id = p_user_id
    AND conv.customer_id = ANY (v_customer_ids);

  IF cardinality(v_conv_ids) > 0 THEN
    DELETE FROM public.messages WHERE conversation_id = ANY (v_conv_ids);
    DELETE FROM public.conversations WHERE id = ANY (v_conv_ids);
  END IF;

  IF to_regclass('public.entity_attachments') IS NOT NULL THEN
    DELETE FROM public.entity_attachments
    WHERE calendar_event_id IN (
      SELECT id FROM public.calendar_events
      WHERE user_id = p_user_id
        AND (
          customer_id = ANY (v_customer_ids)
          OR COALESCE((metadata->>'sandbox_seed')::boolean, false)
          OR COALESCE((metadata->>'sandbox_simulated')::boolean, false)
        )
    );
  END IF;

  DELETE FROM public.calendar_events
  WHERE user_id = p_user_id
    AND (
      customer_id = ANY (v_customer_ids)
      OR COALESCE((metadata->>'sandbox_seed')::boolean, false)
      OR COALESCE((metadata->>'sandbox_simulated')::boolean, false)
    );

  DELETE FROM public.leads
  WHERE user_id = p_user_id
    AND (
      customer_id = ANY (v_customer_ids)
      OR COALESCE((metadata->>'sandbox_seed')::boolean, false)
      OR COALESCE((metadata->>'sandbox_simulated')::boolean, false)
    );

  IF to_regclass('public.payment_requests') IS NOT NULL THEN
    DELETE FROM public.payment_requests
    WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids);
  END IF;

  IF to_regclass('public.customer_payment_events') IS NOT NULL THEN
    DELETE FROM public.customer_payment_events
    WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids);
  END IF;

  IF to_regclass('public.user_notifications') IS NOT NULL THEN
    DELETE FROM public.user_notifications
    WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids);
  END IF;

  IF to_regclass('public.customer_sms_opt_out') IS NOT NULL THEN
    DELETE FROM public.customer_sms_opt_out
    WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids);
  END IF;

  DELETE FROM public.customer_identifiers
  WHERE user_id = p_user_id AND customer_id = ANY (v_customer_ids);

  DELETE FROM public.customers WHERE id = ANY (v_customer_ids);
  GET DIAGNOSTICS v_customers_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'customers_removed', v_customers_removed,
    'customer_ids', to_jsonb(v_customer_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_sandbox_seed_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_sandbox_seed_data(uuid) TO service_role;
