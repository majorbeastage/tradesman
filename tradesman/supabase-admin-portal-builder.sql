-- ============================================================
-- Low-code admin: clients, portal tab config, custom fields, dependencies
-- Run in Supabase → SQL Editor. Run after supabase-profiles-roles.sql.
-- ============================================================

-- Clients (tenants): each client gets its own portal config and custom fields
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Optional: link users to a client (for multi-tenant). If null, use default client.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Portal tabs: which tabs show on User and Office Manager portals, per client
CREATE TABLE IF NOT EXISTS public.portal_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  portal_type TEXT NOT NULL CHECK (portal_type IN ('user', 'office_manager')),
  tab_id TEXT NOT NULL,
  label TEXT,
  visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (client_id, portal_type, tab_id)
);

-- Custom fields: checkboxes, dropdowns, text, textarea – per client
CREATE TABLE IF NOT EXISTS public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('checkbox', 'dropdown', 'text', 'textarea')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  placeholder TEXT,
  options JSONB DEFAULT '[]'::jsonb,
  default_value TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (client_id, key)
);

COMMENT ON COLUMN public.custom_fields.options IS 'For dropdown: [{"value":"a","label":"Option A"},...]';

-- Dependencies: show this field only when another field has a given value
CREATE TABLE IF NOT EXISTS public.custom_field_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  depends_on_custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  show_when_value TEXT NOT NULL,
  CHECK (custom_field_id != depends_on_custom_field_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_tabs_client_portal ON public.portal_tabs (client_id, portal_type);
CREATE INDEX IF NOT EXISTS idx_custom_fields_client ON public.custom_fields (client_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_deps_field ON public.custom_field_dependencies (custom_field_id);

-- RLS: only admins can manage clients and portal config
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage clients" ON public.clients;
CREATE POLICY "Admins manage clients"
  ON public.clients FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage portal_tabs" ON public.portal_tabs;
CREATE POLICY "Admins manage portal_tabs"
  ON public.portal_tabs FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage custom_fields" ON public.custom_fields;
CREATE POLICY "Admins manage custom_fields"
  ON public.custom_fields FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage custom_field_dependencies" ON public.custom_field_dependencies;
CREATE POLICY "Admins manage custom_field_dependencies"
  ON public.custom_field_dependencies FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Authenticated users (and office managers) can read their client's config
DROP POLICY IF EXISTS "Users read own client portal_tabs" ON public.portal_tabs;
CREATE POLICY "Users read own client portal_tabs"
  ON public.portal_tabs FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT COALESCE(p.client_id, (SELECT id FROM public.clients LIMIT 1))
      FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read own client custom_fields" ON public.custom_fields;
CREATE POLICY "Users read own client custom_fields"
  ON public.custom_fields FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT COALESCE(p.client_id, (SELECT id FROM public.clients LIMIT 1))
      FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Everyone can read clients list (for admin dropdown); admins already have full access
DROP POLICY IF EXISTS "Authenticated read clients" ON public.clients;
CREATE POLICY "Authenticated read clients"
  ON public.clients FOR SELECT TO authenticated
  USING (true);

-- Seed one default client so admin has something to select
INSERT INTO public.clients (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Default', 'default')
ON CONFLICT (id) DO NOTHING;

-- Seed default user portal tabs for default client (match current Sidebar)
INSERT INTO public.portal_tabs (client_id, portal_type, tab_id, label, visible, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'dashboard', 'Dashboard', true, 0),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'leads', 'Leads', true, 1),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'conversations', 'Conversations', true, 2),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'quotes', 'Quotes', true, 3),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'calendar', 'Calendar', true, 4),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'customers', 'Customers', true, 5),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'web-support', 'Web Support', true, 6),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'tech-support', 'Tech Support', true, 7),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'user', 'settings', 'Settings', true, 8)
ON CONFLICT (client_id, portal_type, tab_id) DO NOTHING;

INSERT INTO public.portal_tabs (client_id, portal_type, tab_id, label, visible, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'dashboard', 'Dashboard', true, 0),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'leads', 'Leads', true, 1),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'conversations', 'Conversations', true, 2),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'quotes', 'Quotes', true, 3),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'calendar', 'Calendar', true, 4),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'customers', 'Customers', true, 5),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'web-support', 'Web Support', true, 6),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'office_manager', 'tech-support', 'Tech Support', true, 7)
ON CONFLICT (client_id, portal_type, tab_id) DO NOTHING;
