-- ============================================================
-- Optional: view for admins to list users (id, email, role)
-- Only works if your Supabase project allows reading auth.users from a view.
-- If this view fails (permission denied on auth.users), use the Edge Function
-- admin-list-users instead to list users.
-- ============================================================

-- View: join auth.users with profiles so admins can list users
CREATE OR REPLACE VIEW public.admin_users_list
WITH (security_invoker = false)
AS
  SELECT
    u.id,
    u.email,
    u.created_at,
    COALESCE(p.role, 'user') AS role,
    p.display_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id;

-- Only authenticated users can try to select (RLS on view in PG15+)
-- Restrict to admins via RLS on a wrapper table or use the Edge Function.
-- If your Supabase supports RLS on views:
ALTER VIEW public.admin_users_list SET (security_barrier = true);

-- Grant: let authenticated role use the view (actual rows still need admin check in app)
GRANT SELECT ON public.admin_users_list TO authenticated;

COMMENT ON VIEW public.admin_users_list IS 'List of users with profile role; use only in admin context (e.g. Edge Function or app that already verified admin).';
