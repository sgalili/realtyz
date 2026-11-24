ALTER TABLE public.developers ADD COLUMN IF NOT EXISTS yad2_total_projects integer CHECK (yad2_total_projects IS NULL OR yad2_total_projects >= 0);

CREATE OR REPLACE FUNCTION public.my_yad2_project_gap(_owner uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN NULL ELSE (
    SELECT jsonb_build_object('total', d.yad2_total_projects, 'imported', (SELECT count(*) FROM public.developer_projects p WHERE p.developer_id = d.id), 'source_url', d.source_url)
    FROM public.developers d WHERE d.workspace_owner_id = _owner ORDER BY d.created_at LIMIT 1) END
$$;
REVOKE ALL ON FUNCTION public.my_yad2_project_gap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_yad2_project_gap(uuid) TO authenticated;