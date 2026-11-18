CREATE OR REPLACE FUNCTION public.marketing_client_projects(_developer uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _c uuid := public.my_marketing_company_id(); _demo boolean;
BEGIN
  IF _c IS NULL THEN RAISE EXCEPTION 'Marketing company account required'; END IF;
  SELECT is_demo INTO _demo FROM marketing_companies WHERE id = _c;
  RETURN jsonb_build_object(
    'developer', (SELECT jsonb_build_object('id', id, 'name', company_name, 'logo_url', logo_url) FROM developers WHERE id = _developer),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'developer_id', p.developer_id, 'name', p.name, 'city', p.city, 'neighborhood', p.neighborhood, 'address', p.address,
      'status', p.status, 'total_units', p.total_units, 'available_units', p.available_units, 'price_from', p.price_from, 'delivery_date', p.delivery_date,
      'description', p.description, 'images', p.images, 'source_details', p.source_details, 'timeline', p.timeline, 'source_status', p.source_status, 'is_public', p.is_public,
      'image_url', p.image_url, 'source_url', p.source_url, 'apartments', COALESCE(p.apartments, '[]'::jsonb)) ORDER BY p.name)
      FROM developer_projects p JOIN developers d ON d.id = p.developer_id
      WHERE p.developer_id = _developer AND (_demo OR d.marketing_company_id = _c OR p.marketing_company_id = _c)), '[]'::jsonb));
END $function$;