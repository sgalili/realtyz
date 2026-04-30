CREATE POLICY "Users can update own ai_content_logs"
ON public.ai_content_logs
FOR UPDATE
TO authenticated
USING ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Users can delete own ai_content_logs"
ON public.ai_content_logs
FOR DELETE
TO authenticated
USING ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));