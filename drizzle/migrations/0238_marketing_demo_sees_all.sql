ALTER TABLE public.marketing_companies ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
UPDATE public.marketing_companies SET is_demo = true WHERE owner_user_id = '5b59424b-e309-406e-bcc4-65735b2eca50';

CREATE OR REPLACE FUNCTION public.marketing_my_clients()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _c uuid := public.my_marketing_company_id(); _demo boolean;
BEGIN
  IF _c IS NULL THEN RAISE EXCEPTION 'Marketing company account required'; END IF;
  SELECT is_demo INTO _demo FROM marketing_companies WHERE id = _c;
  RETURN jsonb_build_object(
    'company', (SELECT name FROM marketing_companies WHERE id = _c),
    'clients', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
      SELECT jsonb_build_object('id', d.id, 'name', d.company_name, 'logo_url', d.logo_url,
        'projects', (SELECT count(*) FROM developer_projects p WHERE p.developer_id = d.id AND (_demo OR d.marketing_company_id = _c OR p.marketing_company_id = _c)),
        'units', (SELECT COALESCE(sum(jsonb_array_length(CASE WHEN jsonb_typeof(p.apartments) = 'array' THEN p.apartments ELSE '[]'::jsonb END)), 0) FROM developer_projects p WHERE p.developer_id = d.id AND (_demo OR d.marketing_company_id = _c OR p.marketing_company_id = _c))) x
      FROM developers d
      WHERE _demo OR d.marketing_company_id = _c OR EXISTS (SELECT 1 FROM developer_projects p WHERE p.developer_id = d.id AND p.marketing_company_id = _c)) s), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.marketing_client_projects(_developer uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _c uuid := public.my_marketing_company_id(); _demo boolean;
BEGIN
  IF _c IS NULL THEN RAISE EXCEPTION 'Marketing company account required'; END IF;
  SELECT is_demo INTO _demo FROM marketing_companies WHERE id = _c;
  RETURN jsonb_build_object(
    'developer', (SELECT jsonb_build_object('id', id, 'name', company_name, 'logo_url', logo_url) FROM developers WHERE id = _developer),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'city', p.city, 'neighborhood', p.neighborhood, 'address', p.address,
      'status', p.status, 'total_units', p.total_units, 'available_units', p.available_units, 'price_from', p.price_from, 'delivery_date', p.delivery_date,
      'image_url', p.image_url, 'source_url', p.source_url, 'apartments', COALESCE(p.apartments, '[]'::jsonb)) ORDER BY p.name)
      FROM developer_projects p JOIN developers d ON d.id = p.developer_id
      WHERE p.developer_id = _developer AND (_demo OR d.marketing_company_id = _c OR p.marketing_company_id = _c)), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_marketing_overview(_owner uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  RETURN jsonb_build_object(
    'companies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name) FROM marketing_companies WHERE NOT is_demo), '[]'::jsonb),
    'developers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.company_name, 'marketing_company_id', d.marketing_company_id, 'marketing_company_name', m.name))
      FROM developers d LEFT JOIN marketing_companies m ON m.id = d.marketing_company_id WHERE d.workspace_owner_id = _owner), '[]'::jsonb),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'marketing_company_id', p.marketing_company_id, 'marketing_company_name', m.name) ORDER BY p.name)
      FROM developer_projects p LEFT JOIN marketing_companies m ON m.id = p.marketing_company_id WHERE p.workspace_owner_id = _owner), '[]'::jsonb)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.admin_assign_marketing_company(_kind text, _id uuid, _company uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  IF _company IS NOT NULL AND EXISTS (SELECT 1 FROM marketing_companies WHERE id = _company AND is_demo) THEN RAISE EXCEPTION 'demo company cannot be assigned'; END IF;
  IF _kind = 'developer' THEN
    UPDATE developers SET marketing_company_id = _company WHERE id = _id;
  ELSIF _kind = 'project' THEN
    UPDATE developer_projects SET marketing_company_id = _company WHERE id = _id;
  ELSE RAISE EXCEPTION 'invalid kind'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $function$;