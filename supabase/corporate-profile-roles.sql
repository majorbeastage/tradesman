-- Corporate profile roles (Corporate Management, External, Internal).
-- Run in Supabase SQL Editor after supabase-profiles-roles.sql / supabase-signup-new-user-role-about.sql.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (
    role IN (
      'user',
      'new_user',
      'demo_user',
      'office_manager',
      'admin',
      'corporate_management',
      'corporate_external',
      'corporate_internal'
    )
  );

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'Roles: user, new_user, demo_user, office_manager, admin, corporate_management, corporate_external, corporate_internal.';
