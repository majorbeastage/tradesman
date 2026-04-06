-- Extend voicemail-greetings storage so admins and office managers can upload
-- into a managed user's folder (path: {user_id}/...). Run in Supabase SQL Editor
-- after supabase-voicemail-greetings-storage.sql.

DROP POLICY IF EXISTS "Users can manage own voicemail greetings" ON storage.objects;

CREATE POLICY "Users can manage own voicemail greetings"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'voicemail-greetings'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.office_manager_clients omc
        WHERE omc.office_manager_id = auth.uid()
          AND omc.user_id::text = (storage.foldername(name))[1]
      )
    )
  )
  WITH CHECK (
    bucket_id = 'voicemail-greetings'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.office_manager_clients omc
        WHERE omc.office_manager_id = auth.uid()
          AND omc.user_id::text = (storage.foldername(name))[1]
      )
    )
  );
