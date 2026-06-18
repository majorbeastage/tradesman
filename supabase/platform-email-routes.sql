-- ============================================================
-- Platform email routes (v2) — root @tradesman-us.com customer addresses
-- Run after supabase-communications-routing.sql
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_email_reserved_local_parts (
  local_part TEXT PRIMARY KEY,
  reason TEXT
);

INSERT INTO public.platform_email_reserved_local_parts (local_part, reason) VALUES
  ('admin', 'platform ops'),
  ('support', 'platform support'),
  ('noreply', 'system sender'),
  ('no-reply', 'system sender'),
  ('accounts', 'platform billing'),
  ('billing', 'reserved — use accounts@ for platform billing'),
  ('helpdesk', 'platform ops'),
  ('onboarding', 'platform automation'),
  ('mail', 'staff subdomain namespace'),
  ('www', 'web'),
  ('postmaster', 'RFC'),
  ('abuse', 'RFC'),
  ('hostmaster', 'RFC'),
  ('webmaster', 'RFC'),
  ('info', 'generic — reserved for platform'),
  ('sales', 'generic — reserved'),
  ('parts', 'department route namespace'),
  ('permits', 'department route namespace'),
  ('scheduling', 'department route namespace'),
  ('test', 'testing'),
  ('demo', 'demo accounts'),
  ('null', 'invalid'),
  ('root', 'invalid')
ON CONFLICT (local_part) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_email_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_part TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'tradesman-us.com',
  route_kind TEXT NOT NULL CHECK (route_kind IN ('customer_primary', 'department', 'system', 'reserved')),
  account_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  department_key TEXT,
  forward_to_email TEXT,
  channel_id UUID REFERENCES public.client_communication_channels(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_email_routes_local_domain_unique UNIQUE (local_part, domain)
);

CREATE INDEX IF NOT EXISTS idx_platform_email_routes_account_id
  ON public.platform_email_routes (account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_email_routes_channel_id
  ON public.platform_email_routes (channel_id)
  WHERE channel_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_email_routes_one_primary_per_account
  ON public.platform_email_routes (account_id, domain)
  WHERE route_kind = 'customer_primary' AND account_id IS NOT NULL;

ALTER TABLE public.communication_events
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES public.platform_email_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communication_events_route_id
  ON public.communication_events (route_id)
  WHERE route_id IS NOT NULL;

ALTER TABLE public.platform_email_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_email_reserved_local_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read reserved local parts" ON public.platform_email_reserved_local_parts;
CREATE POLICY "Authenticated read reserved local parts"
  ON public.platform_email_reserved_local_parts FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated read platform email routes" ON public.platform_email_routes;
CREATE POLICY "Authenticated read platform email routes"
  ON public.platform_email_routes FOR SELECT TO authenticated
  USING (
    account_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = platform_email_routes.account_id
    )
  );

COMMENT ON TABLE public.platform_email_routes IS 'Registry of @tradesman-us.com (and future custom domain) inbound routes; customer_primary rows provisioned from myT Account.';
COMMENT ON TABLE public.platform_email_reserved_local_parts IS 'Local-parts that cannot be claimed as customer Tradesman email names.';

-- Normalize slug: lowercase, a-z 0-9 hyphen, 3–64 chars
CREATE OR REPLACE FUNCTION public.normalize_platform_email_slug(p_slug TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(regexp_replace(lower(trim(coalesce(p_slug, ''))), '[^a-z0-9-]', '', 'g'), 64);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_account_email(p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = p_account_id
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.office_manager_clients omc
        WHERE omc.office_manager_id = auth.uid() AND omc.user_id = p_account_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_email_slug_available(
  p_slug TEXT,
  p_account_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
BEGIN
  v_slug := public.normalize_platform_email_slug(p_slug);
  IF length(v_slug) < 3 THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_email_reserved_local_parts r
    WHERE lower(r.local_part) = v_slug
  ) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_email_routes r
    WHERE r.domain = 'tradesman-us.com'
      AND lower(r.local_part) = v_slug
      AND (p_account_id IS NULL OR r.account_id IS DISTINCT FROM p_account_id)
  ) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_communication_channels c
    WHERE c.provider = 'resend'
      AND c.channel_kind = 'email'
      AND c.active = true
      AND lower(c.public_address) = v_slug || '@tradesman-us.com'
      AND (p_account_id IS NULL OR c.user_id IS DISTINCT FROM p_account_id)
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_platform_email_route(
  p_account_id UUID,
  p_slug TEXT,
  p_forward_to_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_email TEXT;
  v_channel_id UUID;
  v_route_id UUID;
  v_forward TEXT;
BEGIN
  IF NOT public.can_manage_account_email(p_account_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this account email route';
  END IF;

  v_slug := public.normalize_platform_email_slug(p_slug);
  IF length(v_slug) < 3 OR length(v_slug) > 64 THEN
    RAISE EXCEPTION 'Email name must be 3–64 characters (letters, numbers, hyphens only)';
  END IF;

  IF NOT public.is_platform_email_slug_available(v_slug, p_account_id) THEN
    RAISE EXCEPTION 'That email name is reserved or already taken';
  END IF;

  v_email := v_slug || '@tradesman-us.com';
  v_forward := nullif(lower(trim(coalesce(p_forward_to_email, ''))), '');
  IF v_forward IS NOT NULL AND v_forward = v_email THEN
    RAISE EXCEPTION 'Forward address cannot be the same as your Tradesman email';
  END IF;

  SELECT id INTO v_channel_id
  FROM public.client_communication_channels
  WHERE user_id = p_account_id
    AND channel_kind = 'email'
    AND provider = 'resend'
  ORDER BY active DESC, updated_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO public.client_communication_channels (
      user_id, provider, channel_kind, public_address, forward_to_email,
      email_enabled, active, friendly_name
    ) VALUES (
      p_account_id, 'resend', 'email', v_email, v_forward,
      true, true, 'Tradesman business email'
    )
    RETURNING id INTO v_channel_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.client_communication_channels c
      WHERE c.provider = 'resend'
        AND lower(c.public_address) = v_email
        AND c.id <> v_channel_id
        AND c.active = true
    ) THEN
      RAISE EXCEPTION 'That email address is already assigned to another account';
    END IF;
    UPDATE public.client_communication_channels SET
      public_address = v_email,
      forward_to_email = v_forward,
      email_enabled = true,
      active = true,
      friendly_name = coalesce(nullif(trim(friendly_name), ''), 'Tradesman business email'),
      updated_at = now()
    WHERE id = v_channel_id;
  END IF;

  SELECT id INTO v_route_id
  FROM public.platform_email_routes
  WHERE account_id = p_account_id
    AND domain = 'tradesman-us.com'
    AND route_kind = 'customer_primary'
  LIMIT 1;

  IF v_route_id IS NULL THEN
    INSERT INTO public.platform_email_routes (
      local_part, domain, route_kind, account_id, forward_to_email, channel_id
    ) VALUES (
      v_slug, 'tradesman-us.com', 'customer_primary', p_account_id, v_forward, v_channel_id
    )
    RETURNING id INTO v_route_id;
  ELSE
    UPDATE public.platform_email_routes SET
      local_part = v_slug,
      forward_to_email = v_forward,
      channel_id = v_channel_id,
      updated_at = now()
    WHERE id = v_route_id;
  END IF;

  RETURN jsonb_build_object(
    'route_id', v_route_id,
    'channel_id', v_channel_id,
    'local_part', v_slug,
    'public_address', v_email,
    'forward_to_email', v_forward
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_platform_email_slug(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_email_slug_available(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_platform_email_route(UUID, TEXT, TEXT) TO authenticated;
