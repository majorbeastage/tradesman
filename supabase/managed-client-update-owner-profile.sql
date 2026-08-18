-- Allow managed org members (e.g. Bhair) to update the account owner profile used for
-- Website Builder / hosted site metadata. Run once in Supabase SQL Editor.

DROP POLICY IF EXISTS "Managed clients update account owner profile" ON public.profiles;
CREATE POLICY "Managed clients update account owner profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.user_id = auth.uid()
        AND omc.office_manager_id = profiles.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.user_id = auth.uid()
        AND omc.office_manager_id = profiles.id
    )
  );
