-- Create storage bucket and policies for recorded voicemail greetings.
-- Run in the Supabase SQL Editor.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voicemail-greetings',
  'voicemail-greetings',
  true,
  10485760,
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can manage own voicemail greetings'
  ) THEN
    CREATE POLICY "Users can manage own voicemail greetings"
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (
        bucket_id = 'voicemail-greetings'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'voicemail-greetings'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins can manage global voicemail greetings'
  ) THEN
    CREATE POLICY "Admins can manage global voicemail greetings"
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (
        bucket_id = 'voicemail-greetings'
        AND public.is_admin()
        AND (storage.foldername(name))[1] = 'global'
      )
      WITH CHECK (
        bucket_id = 'voicemail-greetings'
        AND public.is_admin()
        AND (storage.foldername(name))[1] = 'global'
      );
  END IF;
END $$;

