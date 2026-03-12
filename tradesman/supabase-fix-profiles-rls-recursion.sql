-- ============================================================
-- FIX: "infinite recursion detected in policy for relation profiles"
-- Run this in Supabase → SQL Editor → New query → Run
--
-- Cause: Admin policies on profiles were reading from profiles to
-- check admin role, which re-triggered the same policies.
-- Fix: Use a SECURITY DEFINER function that bypasses RLS for the check.
-- ============================================================

-- 1) Helper: returns true if current user has role 'admin' (no RLS recursion)
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

-- 2) Replace admin policy on profiles to use the function
DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) Replace admin policy on office_manager_clients to use the function
DROP POLICY IF EXISTS "Admins full access office_manager_clients" ON public.office_manager_clients;
CREATE POLICY "Admins full access office_manager_clients"
  ON public.office_manager_clients FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
