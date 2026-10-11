CREATE TABLE public.developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  phone TEXT,
  source_url TEXT,
  first_project_name TEXT,
  first_project_units INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX developers_workspace_idx ON public.developers (workspace_owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.developers TO authenticated;
GRANT ALL ON public.developers TO service_role;

ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can read developers"
  ON public.developers FOR SELECT TO authenticated
  USING (public.ws_current_access(workspace_owner_id));

CREATE POLICY "Workspace members can insert developers"
  ON public.developers FOR INSERT TO authenticated
  WITH CHECK (public.ws_current_access(workspace_owner_id));

CREATE POLICY "Workspace members can update developers"
  ON public.developers FOR UPDATE TO authenticated
  USING (public.ws_current_access(workspace_owner_id))
  WITH CHECK (public.ws_current_access(workspace_owner_id));

CREATE POLICY "Workspace members can delete developers"
  ON public.developers FOR DELETE TO authenticated
  USING (public.ws_current_access(workspace_owner_id));

CREATE TRIGGER developers_touch_updated_at
  BEFORE UPDATE ON public.developers
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();