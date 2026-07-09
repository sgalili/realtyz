
-- Authenticated users can read Homely-mirrored media
CREATE POLICY "homely-media read (authenticated)"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'homely-media');

-- Service role handles writes (bypasses RLS anyway; explicit policy for clarity)
CREATE POLICY "homely-media write (service)"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'homely-media');

CREATE POLICY "homely-media update (service)"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'homely-media');

CREATE POLICY "homely-media delete (service)"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'homely-media');
