-- Add ID verification columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS id_document_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS id_verified boolean NOT NULL DEFAULT false;

-- Create storage bucket for voter ID documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('voter-ids', 'voter-ids', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Voters can upload their own ID documents
CREATE POLICY "Voters can upload own ID"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voter-ids' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Voters can view their own ID documents
CREATE POLICY "Voters can view own ID"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voter-ids' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Voters can update/replace their own ID documents
CREATE POLICY "Voters can update own ID"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'voter-ids' AND
  (storage.foldername(name))[1] = auth.uid()::text
);