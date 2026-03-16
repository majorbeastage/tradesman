-- ============================================================
-- Per-user portal config: tabs, settings, dropdowns (all visible/invisible)
-- Run after supabase-profiles-roles.sql
-- Admins can update any profile; RLS already allows "Admins full access profiles"
-- ============================================================

-- portal_config: JSONB. Structure: { "tabs": { "dashboard": true, "leads": true, ... }, "settings": { "custom_fields": true, ... }, "dropdowns": { "lead_source": true, ... } }
-- Missing key or true = visible, false = hidden. Default {} = all visible.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.portal_config IS 'Per-user portal visibility: tabs, settings, dropdowns. {} = all visible. Keys set to false = hidden.';
