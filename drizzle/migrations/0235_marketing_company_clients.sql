ALTER TABLE public.marketing_companies ADD COLUMN owner_user_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION public.my_marketing_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM marketing_companies m
  WHERE m.owner_user_id = auth.uid() AND public.has_role(auth.uid(), 'marketing_company')
$$;

CREATE OR REPLACE FUNCTION public.marketing_my_clients()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid := public.my_marketing_company_id();
BEGIN
  IF _c IS NULL THEN RAISE EXCEPTION 'Marketing company account required'; END IF;
  RETURN jsonb_build_object(
    'company', (SELECT name FROM marketing_companies WHERE id = _c),
    'clients', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
      SELECT jsonb_build_object('id', d.id, 'name', d.company_name, 'logo_url', d.logo_url,
        'projects', (SELECT count(*) FROM developer_projects p WHERE p.developer_id = d.id AND (d.marketing_company_id = _c OR p.marketing_company_id = _c)),
        'units', (SELECT COALESCE(sum(jsonb_array_length(CASE WHEN jsonb_typeof(p.apartments) = 'array' THEN p.apartments ELSE '[]'::jsonb END)), 0) FROM developer_projects p WHERE p.developer_id = d.id AND (d.marketing_company_id = _c OR p.marketing_company_id = _c))) x
      FROM developers d
      WHERE d.marketing_company_id = _c OR EXISTS (SELECT 1 FROM developer_projects p WHERE p.developer_id = d.id AND p.marketing_company_id = _c)) s), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.marketing_client_projects(_developer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid := public.my_marketing_company_id();
BEGIN
  IF _c IS NULL THEN RAISE EXCEPTION 'Marketing company account required'; END IF;
  RETURN jsonb_build_object(
    'developer', (SELECT jsonb_build_object('id', id, 'name', company_name, 'logo_url', logo_url) FROM developers WHERE id = _developer),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'city', p.city, 'neighborhood', p.neighborhood, 'address', p.address,
      'status', p.status, 'total_units', p.total_units, 'available_units', p.available_units, 'price_from', p.price_from, 'delivery_date', p.delivery_date,
      'image_url', p.image_url, 'source_url', p.source_url, 'apartments', COALESCE(p.apartments, '[]'::jsonb)) ORDER BY p.name)
      FROM developer_projects p JOIN developers d ON d.id = p.developer_id
      WHERE p.developer_id = _developer AND (d.marketing_company_id = _c OR p.marketing_company_id = _c)), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.my_marketing_company_id(), public.marketing_my_clients(), public.marketing_client_projects(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_marketing_company_id(), public.marketing_my_clients(), public.marketing_client_projects(uuid) TO authenticated;