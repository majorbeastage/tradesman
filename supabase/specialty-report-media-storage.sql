-- Specialty / inspection report field photos (SpecialtyReportWizardModal).
-- Path: {user_id}/{quote_id}/{filename}
-- Run in Supabase SQL Editor once per project (optional if app uses comm-attachments fallback).

INSERT INTO storage.buckets (id, name, public)
VALUES ('specialty-report-media', 'specialty-report-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Specialty report media read" ON storage.objects;
CREATE POLICY "Specialty report media read" ON storage.objects FOR SELECT USING (bucket_id = 'specialty-report-media');

DROP POLICY IF EXISTS "Specialty report media upload own" ON storage.objects;
CREATE POLICY "Specialty report media upload own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'specialty-report-media' AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Specialty report media update own" ON storage.objects;
CREATE POLICY "Specialty report media update own" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'specialty-report-media' AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Specialty report media delete own" ON storage.objects;
CREATE POLICY "Specialty report media delete own" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'specialty-report-media' AND (storage.foldername(name))[1] = auth.uid()::text
);
