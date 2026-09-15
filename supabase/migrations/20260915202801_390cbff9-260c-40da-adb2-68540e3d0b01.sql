-- Strict per-workspace isolation for Facebook groups and their daily counters.
DROP POLICY IF EXISTS "workspace members view fb user groups" ON public.fb_user_groups;
DROP POLICY IF EXISTS "workspace members insert fb user groups" ON public.fb_user_groups;
DROP POLICY IF EXISTS "workspace members update fb user groups" ON public.fb_user_groups;
DROP POLICY IF EXISTS "workspace members delete fb user groups" ON public.fb_user_groups;

CREATE POLICY "fb groups active workspace select" ON public.fb_user_groups
  FOR SELECT TO authenticated USING (public.ws_current_access(workspace_owner_id));
CREATE POLICY "fb groups active workspace insert" ON public.fb_user_groups
  FOR INSERT TO authenticated WITH CHECK (public.ws_current_access(workspace_owner_id));
CREATE POLICY "fb groups active workspace update" ON public.fb_user_groups
  FOR UPDATE TO authenticated USING (public.ws_current_access(workspace_owner_id))
  WITH CHECK (public.ws_current_access(workspace_owner_id));
CREATE POLICY "fb groups active workspace delete" ON public.fb_user_groups
  FOR DELETE TO authenticated USING (public.ws_current_access(workspace_owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_user_groups TO authenticated;
GRANT ALL ON public.fb_user_groups TO service_role;