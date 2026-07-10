
-- Helper: is the current auth user a member of the given workspace owner?
CREATE OR REPLACE FUNCTION public.is_workspace_member(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE workspace_owner_id = _owner_id
      AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;

-- Extend knowledge_documents SELECT to workspace members (tenants, managing_brokers, etc.)
DROP POLICY IF EXISTS "Users manage own knowledge_documents" ON public.knowledge_documents;

CREATE POLICY "Owners and workspace members read knowledge_documents"
ON public.knowledge_documents
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_workspace_member(user_id)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Owners manage knowledge_documents"
ON public.knowledge_documents
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);
