-- Run in Supabase SQL Editor after existing profile migrations.
-- 1) Role "new_user" for self-service signup (default on new auth users via trigger).
-- 2) Optional best_contact_phone on profiles.
-- 3) Default trigger assigns new_user; admin Edge Function / admin UI still set user/office_manager/admin.

-- Allow new_user in profiles.role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'new_user', 'demo_user', 'office_manager', 'admin'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS best_contact_phone TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_disabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.best_contact_phone IS 'Optional alternate phone for reaching the business (e.g. if different from primary_phone).';
COMMENT ON COLUMN public.profiles.account_disabled IS 'When true, user cannot use the app; data is kept.';

-- New signups default to new_user until an admin promotes them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, portal_config, account_disabled)
  VALUES (
    NEW.id,
    NEW.email,
    'new_user',
    '{"tabs": {"dashboard": true, "leads": false, "conversations": false, "quotes": false, "calendar": false, "customers": false, "account": true, "web-support": false, "tech-support": true, "settings": false}}'::jsonb,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.profiles IS 'Roles: user, new_user (self-signup), demo_user (scheduled data purge), office_manager, admin. See supabase-demo-user-role-and-purge-cron.sql.';

-- Public marketing copy for /about (read-only for anon; admins manage via app + existing admin policy)
DROP POLICY IF EXISTS "Public read tradesman about us" ON public.platform_settings;
CREATE POLICY "Public read tradesman about us"
  ON public.platform_settings FOR SELECT TO anon, authenticated
  USING (key = 'tradesman_about_us');

INSERT INTO public.platform_settings (key, value)
VALUES (
  'tradesman_about_us',
  jsonb_build_object(
    'title', 'About Tradesman',
    'subtitle', 'Built by veterans for contractors who want to focus on the work—not the paperwork.',
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', 'intro',
        'type', 'text',
        'body', 'We are two United States veterans who built Tradesman to help small contractors and trades businesses manage leads, conversations, quotes, and scheduling in one place.'
      )
    )
  )
)
ON CONFLICT (key) DO NOTHING;
