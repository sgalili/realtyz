CREATE TABLE IF NOT EXISTS public.crm_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  profile_type text NOT NULL DEFAULT 'Owner',
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  professional_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrichment_status text NOT NULL DEFAULT 'pending',
  enrichment_last_run_at timestamptz,
  notes text,
  source text DEFAULT 'homely_import',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_profiles_workspace_idx ON public.crm_profiles (workspace_owner_id);
CREATE INDEX IF NOT EXISTS crm_profiles_name_idx ON public.crm_profiles (workspace_owner_id, lower(full_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_profiles TO authenticated;
GRANT ALL ON public.crm_profiles TO service_role;

ALTER TABLE public.crm_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view crm_profiles"
  ON public.crm_profiles FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_owner_id) OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Workspace members can insert crm_profiles"
  ON public.crm_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_owner_id) OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Workspace members can update crm_profiles"
  ON public.crm_profiles FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_owner_id) OR public.is_admin_or_above(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_owner_id) OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Workspace members can delete crm_profiles"
  ON public.crm_profiles FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_owner_id) OR public.is_admin_or_above(auth.uid()));

CREATE TRIGGER update_crm_profiles_updated_at
  BEFORE UPDATE ON public.crm_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_owner_id_idx ON public.listings (owner_id);

-- Purge placeholder URLs from jsonb media_photos arrays
UPDATE public.listings
SET media_photos = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(media_photos) AS elem
    WHERE jsonb_typeof(elem) = 'string'
      AND (elem #>> '{}') !~* '(placeholder|no-?image|default-property|template_property|/images/placeholder)'
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(media_photos) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(media_photos) AS elem
    WHERE jsonb_typeof(elem) = 'string'
      AND (elem #>> '{}') ~* '(placeholder|no-?image|default-property|template_property|/images/placeholder)'
  );
