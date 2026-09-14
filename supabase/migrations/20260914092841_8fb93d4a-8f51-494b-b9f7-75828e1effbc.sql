CREATE POLICY "OAuth states are server-only"
ON public.oauth_connection_states
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);