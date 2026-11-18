CREATE OR REPLACE FUNCTION public.demo_top_developers()
RETURNS TABLE(developer_id uuid, developer_name text, logo_url text, project_count int, unit_count int, projects jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ranked AS (
    SELECT p.developer_id, count(*)::int AS project_count,
      coalesce(sum(CASE WHEN jsonb_typeof(p.apartments)='array' THEN jsonb_array_length(p.apartments) ELSE 0 END),0)::int AS unit_count
    FROM developer_projects p WHERE p.developer_id IS NOT NULL
    GROUP BY p.developer_id ORDER BY 2 DESC, 3 DESC LIMIT 10
  )
  SELECT r.developer_id, d.company_name, d.logo_url, r.project_count, r.unit_count,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'price_from',p.price_from,'image_url',p.image_url,
      'apartments', CASE WHEN jsonb_typeof(p.apartments)='array' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'rooms',a->'rooms','floor',a->'floor','price',a->'price','size',coalesce(a->'size',a->'sqm'))),'[]'::jsonb) FROM jsonb_array_elements(p.apartments) a) ELSE '[]'::jsonb END))
      FROM developer_projects p WHERE p.developer_id=r.developer_id AND p.is_public), '[]'::jsonb)
  FROM ranked r JOIN developers d ON d.id = r.developer_id
  ORDER BY r.project_count + r.unit_count DESC;
$$;
REVOKE ALL ON FUNCTION public.demo_top_developers() FROM public;
GRANT EXECUTE ON FUNCTION public.demo_top_developers() TO anon, authenticated;