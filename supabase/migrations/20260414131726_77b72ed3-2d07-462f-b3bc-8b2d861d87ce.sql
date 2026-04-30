CREATE POLICY "authenticated_insert_ai_content_logs"
ON public.ai_content_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_select_ai_content_logs"
ON public.ai_content_logs
FOR SELECT
TO authenticated
USING (true);