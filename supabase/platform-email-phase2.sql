-- ============================================================
-- Platform email Phase 2 — department routes + forward queue
-- Run after supabase/platform-email-routes.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.communication_email_forward_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_event_id UUID NOT NULL REFERENCES public.communication_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  forward_to_email TEXT NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_email_forward_jobs_status
  ON public.communication_email_forward_jobs (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.communication_email_forward_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages forward jobs" ON public.communication_email_forward_jobs;
CREATE POLICY "Service role manages forward jobs"
  ON public.communication_email_forward_jobs FOR ALL TO authenticated
  USING (public.is_admin() OR user_id = auth.uid())
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

COMMENT ON TABLE public.communication_email_forward_jobs IS 'Optional async copy of inbound mail to external inbox after communication_events insert.';

-- Sync per-account department routes: parts-{slug}@tradesman-us.com, etc.
CREATE OR REPLACE FUNCTION public.sync_platform_department_routes(
  p_account_id UUID,
  p_enabled_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_key TEXT;
  v_local TEXT;
  v_email TEXT;
  v_primary_channel UUID;
  v_route_id UUID;
  v_enabled TEXT[] := ARRAY[]::TEXT[];
  v_created TEXT[] := ARRAY[]::TEXT[];
  v_removed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT public.can_manage_account_email(p_account_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT lower(local_part), channel_id INTO v_slug, v_primary_channel
  FROM public.platform_email_routes
  WHERE account_id = p_account_id
    AND domain = 'tradesman-us.com'
    AND route_kind = 'customer_primary'
  LIMIT 1;

  IF v_slug IS NULL OR length(v_slug) < 3 THEN
    RAISE EXCEPTION 'Claim a Tradesman business email first (customer_primary route).';
  END IF;

  IF p_enabled_keys IS NOT NULL THEN
    FOREACH v_key IN ARRAY p_enabled_keys LOOP
      v_key := lower(regexp_replace(trim(coalesce(v_key, '')), '[^a-z0-9-]', '', 'g'));
      IF length(v_key) >= 2 AND NOT (v_key = ANY (v_enabled)) THEN
        v_enabled := array_append(v_enabled, v_key);
      END IF;
    END LOOP;
  END IF;

  -- Remove department routes no longer enabled
  FOR v_local IN
    SELECT local_part FROM public.platform_email_routes
    WHERE account_id = p_account_id
      AND domain = 'tradesman-us.com'
      AND route_kind = 'department'
  LOOP
    v_key := split_part(v_local, '-', 1);
    IF NOT (v_key = ANY (v_enabled)) THEN
      DELETE FROM public.platform_email_routes
      WHERE account_id = p_account_id
        AND domain = 'tradesman-us.com'
        AND route_kind = 'department'
        AND local_part = v_local;
      v_removed := array_append(v_removed, v_local || '@tradesman-us.com');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY v_enabled LOOP
    v_local := v_key || '-' || v_slug;
    v_email := v_local || '@tradesman-us.com';

    IF NOT public.is_platform_email_slug_available(v_local, p_account_id) THEN
      -- Allow if we already own this department route
      IF NOT EXISTS (
        SELECT 1 FROM public.platform_email_routes
        WHERE account_id = p_account_id AND local_part = v_local AND route_kind = 'department'
      ) THEN
        RAISE EXCEPTION 'Department address % is not available', v_email;
      END IF;
    END IF;

    SELECT id INTO v_route_id
    FROM public.platform_email_routes
    WHERE account_id = p_account_id
      AND domain = 'tradesman-us.com'
      AND route_kind = 'department'
      AND department_key = v_key
    LIMIT 1;

    IF v_route_id IS NULL THEN
      INSERT INTO public.platform_email_routes (
        local_part, domain, route_kind, account_id, department_key, channel_id
      ) VALUES (
        v_local, 'tradesman-us.com', 'department', p_account_id, v_key, v_primary_channel
      );
      v_created := array_append(v_created, v_email);
    ELSE
      UPDATE public.platform_email_routes SET
        local_part = v_local,
        channel_id = v_primary_channel,
        updated_at = now()
      WHERE id = v_route_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'slug', v_slug,
    'enabled', to_jsonb(v_enabled),
    'created', to_jsonb(v_created),
    'removed', to_jsonb(v_removed)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_platform_department_routes(UUID, TEXT[]) TO authenticated;
