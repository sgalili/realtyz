CREATE OR REPLACE FUNCTION public.shares_workspace_with(_row_user uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _row_user IS NOT NULL
     AND _viewer IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_memberships viewer_wm
       JOIN public.workspace_memberships row_wm
         ON row_wm.workspace_owner_id = viewer_wm.workspace_owner_id
       WHERE viewer_wm.user_id = _viewer
         AND row_wm.user_id = _row_user
     );
$$;

CREATE OR REPLACE FUNCTION public.can_access_campaign_log_owner(_row_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       _row_user = auth.uid()
       OR public.shares_workspace_with(_row_user, auth.uid())
       OR public.has_role(auth.uid(), 'super_admin'::app_role)
     );
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_member_ids(_owner uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wm.user_id
  FROM public.workspace_memberships wm
  WHERE wm.workspace_owner_id = _owner
    AND public.can_access_workspace_owner(_owner);
$$;

GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_campaign_log_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "Workspace members can view campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Workspace members can insert campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Workspace members can update campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Workspace members can delete campaign_logs" ON public.campaign_logs;

CREATE POLICY "Workspace members can view campaign_logs"
ON public.campaign_logs
FOR SELECT
TO authenticated
USING (public.can_access_campaign_log_owner(user_id));

CREATE POLICY "Workspace members can insert campaign_logs"
ON public.campaign_logs
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_workspace_owner(user_id));

CREATE POLICY "Workspace members can update campaign_logs"
ON public.campaign_logs
FOR UPDATE
TO authenticated
USING (public.can_access_campaign_log_owner(user_id))
WITH CHECK (public.can_access_workspace_owner(user_id) OR public.can_access_campaign_log_owner(user_id));

CREATE POLICY "Workspace members can delete campaign_logs"
ON public.campaign_logs
FOR DELETE
TO authenticated
USING (public.can_access_campaign_log_owner(user_id));