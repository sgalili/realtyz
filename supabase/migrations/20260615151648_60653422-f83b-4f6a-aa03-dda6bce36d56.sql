
-- Helper: is _user a member of the workspace owned by _owner?
CREATE OR REPLACE FUNCTION public.is_workspace_member(_owner uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE workspace_owner_id = _owner AND user_id = _user
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;

-- Replace campaign_logs policies so workspace members see the same history as the owner.
DROP POLICY IF EXISTS "Users view own campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Users update own campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Users delete own campaign_logs" ON public.campaign_logs;
DROP POLICY IF EXISTS "Users insert own campaign_logs" ON public.campaign_logs;

CREATE POLICY "Workspace can view campaign_logs"
  ON public.campaign_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(user_id, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Workspace can insert campaign_logs"
  ON public.campaign_logs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_workspace_member(user_id, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Workspace can update campaign_logs"
  ON public.campaign_logs FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(user_id, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Workspace can delete campaign_logs"
  ON public.campaign_logs FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(user_id, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
