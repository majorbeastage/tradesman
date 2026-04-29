-- Profile photos (My T → Contact): client uploads to `profile-photos` bucket; URL stored in profiles.metadata.profile_photo_url
-- Run in Supabase SQL Editor once per project.

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Profile photos read" ON storage.objects;
CREATE POLICY "Profile photos read" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "Profile photos upload own" ON storage.objects;
CREATE POLICY "Profile photos upload own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Profile photos update own" ON storage.objects;
CREATE POLICY "Profile photos update own" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Profile photos delete own" ON storage.objects;
CREATE POLICY "Profile photos delete own" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text
);
