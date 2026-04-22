-- Allow companies to view voter profiles (for ID review)
CREATE POLICY "Companies can view voter profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'voter' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'company'
  )
);

-- Allow companies to update id_verified on voter profiles
CREATE POLICY "Companies can verify voter IDs"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  role = 'voter' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'company'
  )
)
WITH CHECK (
  role = 'voter' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'company'
  )
);

-- Allow companies to view voter ID documents in storage
CREATE POLICY "Companies can view voter IDs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voter-ids' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'company'
  )
);