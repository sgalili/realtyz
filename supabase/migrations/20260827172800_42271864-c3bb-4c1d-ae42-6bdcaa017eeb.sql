CREATE TABLE public.campaign_composer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_owner_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_composer_sessions TO authenticated;
GRANT ALL ON public.campaign_composer_sessions TO service_role;

ALTER TABLE public.campaign_composer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can read campaign composer sessions"
ON public.campaign_composer_sessions
FOR SELECT TO authenticated
USING (public.can_access_workspace_owner(workspace_owner_id));

CREATE POLICY "Workspace members can create campaign composer sessions"
ON public.campaign_composer_sessions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.can_access_workspace_owner(workspace_owner_id)
);

CREATE POLICY "Workspace members can update campaign composer sessions"
ON public.campaign_composer_sessions
FOR UPDATE TO authenticated
USING (public.can_access_workspace_owner(workspace_owner_id))
WITH CHECK (public.can_access_workspace_owner(workspace_owner_id));

CREATE POLICY "Workspace members can delete campaign composer sessions"
ON public.campaign_composer_sessions
FOR DELETE TO authenticated
USING (public.can_access_workspace_owner(workspace_owner_id));

CREATE TRIGGER touch_campaign_composer_sessions_updated_at
BEFORE UPDATE ON public.campaign_composer_sessions
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();