
CREATE TABLE IF NOT EXISTS public.custom_user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  group_name text NOT NULL,
  group_url text NOT NULL,
  platform text NOT NULL DEFAULT 'facebook',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_user_groups TO authenticated;
GRANT ALL ON public.custom_user_groups TO service_role;

ALTER TABLE public.custom_user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can view custom groups"
  ON public.custom_user_groups FOR SELECT TO authenticated
  USING (
    workspace_owner_id = auth.uid()
    OR public.is_workspace_member(workspace_owner_id, auth.uid())
  );

CREATE POLICY "workspace members can insert custom groups"
  ON public.custom_user_groups FOR INSERT TO authenticated
  WITH CHECK (
    workspace_owner_id = auth.uid()
    OR public.is_workspace_member(workspace_owner_id, auth.uid())
  );

CREATE POLICY "workspace members can update custom groups"
  ON public.custom_user_groups FOR UPDATE TO authenticated
  USING (
    workspace_owner_id = auth.uid()
    OR public.is_workspace_member(workspace_owner_id, auth.uid())
  );

CREATE POLICY "workspace members can delete custom groups"
  ON public.custom_user_groups FOR DELETE TO authenticated
  USING (
    workspace_owner_id = auth.uid()
    OR public.is_workspace_member(workspace_owner_id, auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_custom_user_groups_workspace
  ON public.custom_user_groups(workspace_owner_id, platform);

CREATE TRIGGER trg_custom_user_groups_updated_at
  BEFORE UPDATE ON public.custom_user_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
