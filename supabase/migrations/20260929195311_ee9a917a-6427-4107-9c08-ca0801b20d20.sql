DROP POLICY IF EXISTS "Workspace members manage owner kb_whitelist" ON public.kb_whitelist;
CREATE POLICY "Workspace members manage owner kb_whitelist"
ON public.kb_whitelist FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_workspace_member(user_id, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_workspace_member(user_id, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);