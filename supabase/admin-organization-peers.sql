-- Assign all platform admin accounts to the shared Tradesman org client.
-- Run once in Supabase SQL Editor so admins see each other on org chart / share lists.
UPDATE public.profiles
SET client_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE role = 'admin'
  AND (client_id IS NULL OR client_id <> '00000000-0000-0000-0000-000000000001'::uuid);
