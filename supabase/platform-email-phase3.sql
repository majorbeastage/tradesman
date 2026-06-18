-- ============================================================
-- Platform email Phase 3 — verified custom domains (Option B)
-- Run after platform-email-routes.sql and platform-email-phase2.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_custom_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  verified_at TIMESTAMPTZ,
  resend_domain_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_custom_email_domains_domain_lower CHECK (domain = lower(trim(domain))),
  UNIQUE (account_id, domain)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_custom_email_domains_domain_unique
  ON public.platform_custom_email_domains (lower(domain));

CREATE INDEX IF NOT EXISTS idx_platform_custom_email_domains_account
  ON public.platform_custom_email_domains (account_id);

ALTER TABLE public.platform_custom_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read own custom email domains" ON public.platform_custom_email_domains;
CREATE POLICY "Authenticated read own custom email domains"
  ON public.platform_custom_email_domains FOR SELECT TO authenticated
  USING (
    account_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid() AND omc.user_id = platform_custom_email_domains.account_id
    )
  );

COMMENT ON TABLE public.platform_custom_email_domains IS 'Customer-owned domains verified for Option B email (servicerequests@theircompany.com).';

ALTER TABLE public.platform_email_routes DROP CONSTRAINT IF EXISTS platform_email_routes_route_kind_check;
ALTER TABLE public.platform_email_routes ADD CONSTRAINT platform_email_routes_route_kind_check
  CHECK (route_kind IN ('customer_primary', 'customer_custom', 'department', 'system', 'reserved'));

CREATE OR REPLACE FUNCTION public.normalize_custom_email_domain(p_domain TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(trim(coalesce(p_domain, '')), '^https?://', '', 'i'),
      '^www\.',
      '',
      'i'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.register_custom_email_domain(
  p_account_id UUID,
  p_domain TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
  v_token TEXT;
  v_id UUID;
  v_status TEXT;
BEGIN
  IF NOT public.can_manage_account_email(p_account_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_domain := public.normalize_custom_email_domain(p_domain);
  IF v_domain = '' OR position('.' in v_domain) = 0 THEN
    RAISE EXCEPTION 'Enter a valid domain (e.g. stillcreeklandscaping.com)';
  END IF;
  IF v_domain IN ('tradesman-us.com', 'mail.tradesman-us.com') THEN
    RAISE EXCEPTION 'Use Tradesman email settings for @tradesman-us.com addresses';
  END IF;

  v_token := 'tradesman-verify=' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.platform_custom_email_domains (account_id, domain, verification_token, status)
  VALUES (p_account_id, v_domain, v_token, 'pending')
  ON CONFLICT (account_id, domain) DO UPDATE SET
    updated_at = now(),
    verification_token = CASE
      WHEN platform_custom_email_domains.status = 'verified' THEN platform_custom_email_domains.verification_token
      ELSE EXCLUDED.verification_token
    END,
    status = CASE
      WHEN platform_custom_email_domains.status = 'verified' THEN 'verified'
      ELSE 'pending'
    END
  RETURNING id INTO v_id;

  SELECT verification_token, status INTO v_token, v_status
  FROM public.platform_custom_email_domains
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'domain', v_domain,
    'verification_token', v_token,
    'txt_host', '_tradesman-verify',
    'txt_value', v_token,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_custom_email_domain_verified(
  p_account_id UUID,
  p_domain TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  IF NOT public.can_manage_account_email(p_account_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_domain := public.normalize_custom_email_domain(p_domain);

  UPDATE public.platform_custom_email_domains SET
    status = 'verified',
    verified_at = now(),
    updated_at = now()
  WHERE account_id = p_account_id
    AND domain = v_domain
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found or already verified';
  END IF;

  RETURN jsonb_build_object('domain', v_domain, 'status', 'verified');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_custom_email_route(
  p_account_id UUID,
  p_domain TEXT,
  p_local_part TEXT,
  p_prefer_for_outbound BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
  v_slug TEXT;
  v_email TEXT;
  v_channel_id UUID;
  v_route_id UUID;
  v_domain_row RECORD;
BEGIN
  IF NOT public.can_manage_account_email(p_account_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_domain := public.normalize_custom_email_domain(p_domain);
  v_slug := public.normalize_platform_email_slug(p_local_part);
  IF length(v_slug) < 2 THEN
    RAISE EXCEPTION 'Email name must be at least 2 characters';
  END IF;

  SELECT * INTO v_domain_row
  FROM public.platform_custom_email_domains
  WHERE account_id = p_account_id AND domain = v_domain AND status = 'verified'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verify your domain before claiming an address on it';
  END IF;

  v_email := v_slug || '@' || v_domain;

  IF EXISTS (
    SELECT 1 FROM public.platform_email_routes r
    WHERE r.domain = v_domain AND lower(r.local_part) = v_slug
      AND (r.account_id IS DISTINCT FROM p_account_id)
  ) THEN
    RAISE EXCEPTION 'That address is already taken';
  END IF;

  SELECT id INTO v_channel_id
  FROM public.client_communication_channels
  WHERE user_id = p_account_id AND channel_kind = 'email' AND provider = 'resend'
  ORDER BY active DESC, updated_at DESC
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    RAISE EXCEPTION 'Claim your free Tradesman address first';
  END IF;

  SELECT id INTO v_route_id
  FROM public.platform_email_routes
  WHERE account_id = p_account_id AND domain = v_domain AND route_kind = 'customer_custom'
  LIMIT 1;

  IF v_route_id IS NULL THEN
    INSERT INTO public.platform_email_routes (
      local_part, domain, route_kind, account_id, channel_id, verified_at
    ) VALUES (
      v_slug, v_domain, 'customer_custom', p_account_id, v_channel_id, v_domain_row.verified_at
    )
    RETURNING id INTO v_route_id;
  ELSE
    UPDATE public.platform_email_routes SET
      local_part = v_slug,
      channel_id = v_channel_id,
      verified_at = v_domain_row.verified_at,
      updated_at = now()
    WHERE id = v_route_id;
  END IF;

  IF p_prefer_for_outbound THEN
    UPDATE public.profiles SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('email_outbound_route_id', v_route_id::text)
    WHERE id = p_account_id;
  END IF;

  RETURN jsonb_build_object(
    'route_id', v_route_id,
    'public_address', v_email,
    'domain', v_domain,
    'local_part', v_slug,
    'prefer_for_outbound', p_prefer_for_outbound
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_custom_email_domain(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_custom_email_domain(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_custom_email_domain_verified(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_custom_email_route(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
