-- Public About Us page: image uploads (admin only). Run in Supabase SQL Editor after is_admin() exists.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'about-us-images',
  'about-us-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read about us images" ON storage.objects;
CREATE POLICY "Public read about us images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'about-us-images');

DROP POLICY IF EXISTS "Admins manage about us images" ON storage.objects;
CREATE POLICY "Admins manage about us images"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'about-us-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'about-us-images' AND public.is_admin());
