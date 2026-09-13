DROP POLICY IF EXISTS "Workspace can view closing_documents" ON public.closing_documents;
CREATE POLICY "Workspace can view closing_documents"
ON public.closing_documents
FOR SELECT
TO authenticated
USING (public.in_current_workspace(user_id));