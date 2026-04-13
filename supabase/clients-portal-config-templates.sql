-- Portal builder: templates for bulk audiences (All profiles, All users, etc.).
-- Saved here when an admin edits a bulk scope — does NOT overwrite profiles.portal_config
-- until an explicit "apply to matching profiles" action is used in Admin Portal.
-- Run in Supabase SQL Editor after public.clients exists (supabase-admin-portal-builder.sql).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_config_templates JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.portal_config_templates IS
  'JSON object keyed by bulk audience id (__all_profiles__, __all__, etc.): default portal config for that scope. Per-user profiles.portal_config is unchanged when this is updated.';
