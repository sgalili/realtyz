ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;

UPDATE public.social_connections
SET workspace_owner_id = COALESCE(workspace_owner_id, created_by)
WHERE workspace_owner_id IS NULL;

ALTER TABLE public.social_connections
  ALTER COLUMN workspace_owner_id SET DEFAULT public.current_workspace_owner();

CREATE INDEX IF NOT EXISTS social_connections_ws_platform_idx
  ON public.social_connections (workspace_owner_id, platform);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO authenticated;
GRANT ALL ON public.social_connections TO service_role;

DROP POLICY IF EXISTS "social_connections_select_workspace" ON public.social_connections;
DROP POLICY IF EXISTS "Users can create own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can update own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Admins can insert social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Admins can update social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Admins can delete social connections" ON public.social_connections;

CREATE POLICY "social_connections_select_ws" ON public.social_connections
FOR SELECT TO authenticated
USING (
  public.ws_current_access(workspace_owner_id)
  OR (workspace_owner_id IS NULL AND created_by = auth.uid())
);

CREATE POLICY "social_connections_insert_ws" ON public.social_connections
FOR INSERT TO authenticated
WITH CHECK (public.ws_current_access(COALESCE(workspace_owner_id, public.current_workspace_owner())));

CREATE POLICY "social_connections_update_ws" ON public.social_connections
FOR UPDATE TO authenticated
USING (
  public.ws_current_access(workspace_owner_id)
  OR (workspace_owner_id IS NULL AND created_by = auth.uid())
)
WITH CHECK (
  public.ws_current_access(COALESCE(workspace_owner_id, public.current_workspace_owner()))
  OR (workspace_owner_id IS NULL AND created_by = auth.uid())
);

CREATE POLICY "social_connections_delete_ws" ON public.social_connections
FOR DELETE TO authenticated
USING (
  public.ws_current_access(workspace_owner_id)
  OR (workspace_owner_id IS NULL AND created_by = auth.uid())
);