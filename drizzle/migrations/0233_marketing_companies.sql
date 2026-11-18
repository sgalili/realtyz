CREATE TABLE public.marketing_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX marketing_companies_name_key ON public.marketing_companies (lower(btrim(name)));
GRANT SELECT, INSERT, UPDATE ON public.marketing_companies TO authenticated;
GRANT ALL ON public.marketing_companies TO service_role;
ALTER TABLE public.marketing_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage marketing companies" ON public.marketing_companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.developers ADD COLUMN marketing_company_id uuid REFERENCES public.marketing_companies(id) ON DELETE SET NULL;
ALTER TABLE public.developer_projects ADD COLUMN marketing_company_id uuid REFERENCES public.marketing_companies(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_marketing_overview(_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  RETURN jsonb_build_object(
    'companies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name) FROM marketing_companies), '[]'::jsonb),
    'developers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.company_name, 'marketing_company_id', d.marketing_company_id, 'marketing_company_name', m.name))
      FROM developers d LEFT JOIN marketing_companies m ON m.id = d.marketing_company_id WHERE d.workspace_owner_id = _owner), '[]'::jsonb),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'marketing_company_id', p.marketing_company_id, 'marketing_company_name', m.name) ORDER BY p.name)
      FROM developer_projects p LEFT JOIN marketing_companies m ON m.id = p.marketing_company_id WHERE p.workspace_owner_id = _owner), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_marketing_summaries(_owners uuid[])
RETURNS TABLE(owner_id uuid, marketing_company_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  RETURN QUERY SELECT o, COALESCE(
    (SELECT string_agg(DISTINCT m.name, ', ') FROM developers d JOIN marketing_companies m ON m.id = d.marketing_company_id WHERE d.workspace_owner_id = o),
    (SELECT string_agg(DISTINCT m.name, ', ') FROM developer_projects p JOIN marketing_companies m ON m.id = p.marketing_company_id WHERE p.workspace_owner_id = o))
  FROM unnest(_owners) o;
END $$;

CREATE OR REPLACE FUNCTION public.admin_assign_marketing_company(_kind text, _id uuid, _company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  IF _kind = 'developer' THEN
    UPDATE developers SET marketing_company_id = _company WHERE id = _id;
  ELSIF _kind = 'project' THEN
    UPDATE developer_projects SET marketing_company_id = _company WHERE id = _id;
  ELSE RAISE EXCEPTION 'invalid kind'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_marketing_overview(uuid), public.admin_marketing_summaries(uuid[]), public.admin_assign_marketing_company(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketing_overview(uuid), public.admin_marketing_summaries(uuid[]), public.admin_assign_marketing_company(text, uuid, uuid) TO authenticated;