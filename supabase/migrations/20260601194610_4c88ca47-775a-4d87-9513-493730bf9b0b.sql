-- Singleton workspace-level Ayrshare profile (shared by all brokers in the workspace)
CREATE TABLE public.workspace_social_profile (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  ayrshare_profile_key text,
  ayrshare_ref_id text,
  connected_platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
  facebook_page_id text,
  facebook_page_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_social_profile_singleton CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

GRANT SELECT ON public.workspace_social_profile TO authenticated;
GRANT ALL ON public.workspace_social_profile TO service_role;

ALTER TABLE public.workspace_social_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read workspace social profile"
ON public.workspace_social_profile FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage workspace social profile"
ON public.workspace_social_profile FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_workspace_social_profile_updated_at
BEFORE UPDATE ON public.workspace_social_profile
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the singleton row
INSERT INTO public.workspace_social_profile (id) VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;