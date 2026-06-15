CREATE OR REPLACE FUNCTION public.is_workspace_member(_owner uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _owner IS NOT NULL
     AND _user IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_memberships wm
       WHERE wm.workspace_owner_id = _owner
         AND wm.user_id = _user
     );
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace_owner(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       _owner = auth.uid()
       OR public.is_workspace_member(_owner, auth.uid())
       OR public.has_role(auth.uid(), 'super_admin'::app_role)
     );
$$;

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_owner_user
ON public.workspace_memberships (workspace_owner_id, user_id);

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_workspace_owner(uuid) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_logs TO authenticated;
GRANT ALL ON public.campaign_logs TO service_role;
GRANT SELECT ON public.workspace_memberships TO authenticated;
GRANT ALL ON public.workspace_memberships TO service_role;

DROP POLICY IF EXISTS "Workspace can view campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Workspace can insert campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Workspace can update campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Workspace can delete campaign_logs" ON public.campaign_logs;

CREATE POLICY "Workspace members can view campaign_logs"
ON public.campaign_logs
FOR SELECT
TO authenticated
USING (public.can_access_workspace_owner(user_id));

CREATE POLICY "Workspace members can insert campaign_logs"
ON public.campaign_logs
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_workspace_owner(user_id));

CREATE POLICY "Workspace members can update campaign_logs"
ON public.campaign_logs
FOR UPDATE
TO authenticated
USING (public.can_access_workspace_owner(user_id))
WITH CHECK (public.can_access_workspace_owner(user_id));

CREATE POLICY "Workspace members can delete campaign_logs"
ON public.campaign_logs
FOR DELETE
TO authenticated
USING (public.can_access_workspace_owner(user_id));