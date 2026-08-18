-- Allow account owners / managed org members to upload website assets under each other's
-- profile-photos folders (Website Builder logo/photos when scoped to the account owner).
-- Run in Supabase SQL Editor once.

DROP POLICY IF EXISTS "Profile photos upload org" ON storage.objects;
CREATE POLICY "Profile photos upload org" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'profile-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid()
        AND omc.user_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.user_id = auth.uid()
        AND omc.office_manager_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Profile photos update org" ON storage.objects;
CREATE POLICY "Profile photos update org" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'profile-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.office_manager_id = auth.uid()
        AND omc.user_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.office_manager_clients omc
      WHERE omc.user_id = auth.uid()
        AND omc.office_manager_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "comm_attachments_insert_org" ON storage.objects;
CREATE POLICY "comm_attachments_insert_org"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comm-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.office_manager_clients omc
        WHERE omc.office_manager_id = auth.uid()
          AND omc.user_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.office_manager_clients omc
        WHERE omc.user_id = auth.uid()
          AND omc.office_manager_id::text = (storage.foldername(name))[1]
      )
    )
  );
