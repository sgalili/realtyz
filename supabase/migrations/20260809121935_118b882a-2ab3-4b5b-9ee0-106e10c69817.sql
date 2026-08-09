CREATE TABLE public.fb_personal_connections (
  workspace_owner_id uuid PRIMARY KEY,
  fb_user_id text,
  fb_user_name text,
  fb_avatar_url text,
  access_token text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_by uuid,
  connected_at timestamptz,
  last_import_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (workspace_owner_id, fb_user_id, fb_user_name, fb_avatar_url, token_expires_at, scopes, connected_by, connected_at, last_import_at, last_error, created_at, updated_at) ON public.fb_personal_connections TO authenticated;
GRANT DELETE ON public.fb_personal_connections TO authenticated;
GRANT ALL ON public.fb_personal_connections TO service_role;

ALTER TABLE public.fb_personal_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view fb personal connection"
  ON public.fb_personal_connections FOR SELECT TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.is_workspace_member(workspace_owner_id, auth.uid()));

CREATE POLICY "workspace members delete fb personal connection"
  ON public.fb_personal_connections FOR DELETE TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.is_workspace_member(workspace_owner_id, auth.uid()));

CREATE TRIGGER trg_fb_personal_connections_updated_at
  BEFORE UPDATE ON public.fb_personal_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fb_user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  group_id text NOT NULL,
  group_name text NOT NULL,
  group_icon text,
  group_url text,
  privacy text,
  member_count integer,
  is_administrator boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_owner_id, group_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_user_groups TO authenticated;
GRANT ALL ON public.fb_user_groups TO service_role;

ALTER TABLE public.fb_user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view fb user groups"
  ON public.fb_user_groups FOR SELECT TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.is_workspace_member(workspace_owner_id, auth.uid()));

CREATE POLICY "workspace members insert fb user groups"
  ON public.fb_user_groups FOR INSERT TO authenticated
  WITH CHECK (workspace_owner_id = auth.uid() OR public.is_workspace_member(workspace_owner_id, auth.uid()));

CREATE POLICY "workspace members update fb user groups"
  ON public.fb_user_groups FOR UPDATE TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.is_workspace_member(workspace_owner_id, auth.uid()));

CREATE POLICY "workspace members delete fb user groups"
  ON public.fb_user_groups FOR DELETE TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.is_workspace_member(workspace_owner_id, auth.uid()));

CREATE TRIGGER trg_fb_user_groups_updated_at
  BEFORE UPDATE ON public.fb_user_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();