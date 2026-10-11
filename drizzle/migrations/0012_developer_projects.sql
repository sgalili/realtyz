ALTER TABLE public.developers ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.developers ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.developers ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE TABLE public.developer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  developer_id uuid NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  neighborhood text,
  address text,
  status text NOT NULL DEFAULT 'marketing',
  total_units integer,
  available_units integer,
  price_from numeric,
  delivery_date text,
  description text,
  image_url text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  apartments jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text,
  source_project_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (developer_id, source_project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.developer_projects TO authenticated;
GRANT ALL ON public.developer_projects TO service_role;
ALTER TABLE public.developer_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws access developer_projects" ON public.developer_projects FOR ALL TO authenticated
  USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
CREATE INDEX developer_projects_dev_idx ON public.developer_projects(developer_id);
CREATE TRIGGER developer_projects_touch BEFORE UPDATE ON public.developer_projects FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.register_as_developer(_display_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _r := public.register_as_broker(_display_name);
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'developer') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'role', 'developer', 'user_id', auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.register_as_developer(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_as_developer(text) TO authenticated;