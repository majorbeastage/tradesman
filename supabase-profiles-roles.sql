-- ============================================================
-- RUN THIS FIRST: creates the "profiles" table (and related tables)
-- Profiles and roles: user, office_manager, admin
-- Office manager clients: which users each office manager can manage
--
-- In Supabase: SQL Editor → New query → paste this whole file → Run
-- Then see FIRST-ADMIN-SETUP.md to create your first admin user.
-- ============================================================

-- User profiles (role per auth user)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'office_manager', 'admin')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Backward-compatible: add email if profiles already exists from older setup
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Which users an office manager can manage (office manager's "clients")
CREATE TABLE IF NOT EXISTS public.office_manager_clients (
  office_manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (office_manager_id, user_id),
  CHECK (office_manager_id != user_id)
);

-- Helper: check if current user is admin (avoids RLS recursion when used in profiles policies)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- RLS: users can read own profile; admins can read/update all; office managers can read their clients' profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile (limited)" ON public.profiles;
CREATE POLICY "Users can update own profile (limited)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow insert on signup (so profile can be created when user registers)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Admins can do anything on profiles (for role assignment) — uses is_admin() to avoid recursion
DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Office manager clients: office managers can read/manage their own client list; admins can do everything
ALTER TABLE public.office_manager_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office managers can manage own clients" ON public.office_manager_clients;
CREATE POLICY "Office managers can manage own clients"
  ON public.office_manager_clients FOR ALL TO authenticated
  USING (office_manager_id = auth.uid())
  WITH CHECK (office_manager_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access office_manager_clients" ON public.office_manager_clients;
CREATE POLICY "Admins full access office_manager_clients"
  ON public.office_manager_clients FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Optional: trigger to create profile on signup (assigns default role 'user')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TABLE public.profiles IS 'User role: user, office_manager, or admin. Admins assign roles in the Admin portal.';
COMMENT ON TABLE public.office_manager_clients IS 'Which users each office manager can manage (their clients).';
