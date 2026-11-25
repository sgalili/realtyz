CREATE OR REPLACE FUNCTION public.owned_marketing_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.marketing_companies WHERE owner_user_id = auth.uid() AND NOT is_demo AND public.has_role(auth.uid(), 'marketing_company') ORDER BY created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.owned_marketing_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owned_marketing_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_marketing_company_signup(_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); saved text; company uuid; nm text; area text; pname text; pphone text; pgender text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF COALESCE((SELECT platform_mode FROM public.platform_system_settings LIMIT 1), 'brokers_only') <> 'full_marketplace' THEN RAISE EXCEPTION 'signup_type_unavailable'; END IF;
  IF _details IS NULL OR jsonb_typeof(_details) <> 'object' THEN RAISE EXCEPTION 'invalid_details'; END IF;
  nm := left(btrim(COALESCE(_details->>'company_name','')), 200);
  area := left(btrim(COALESCE(_details->>'service_area','')), 200);
  IF nm = '' OR area = '' THEN RAISE EXCEPTION 'invalid_details'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
  PERFORM public.ensure_profile_row(uid);
  SELECT primary_user_type, full_name, phone, gender INTO saved, pname, pphone, pgender FROM public.profiles WHERE id = uid FOR UPDATE;
  IF saved IS NOT NULL THEN RAISE EXCEPTION 'primary_type_already_selected'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role NOT IN ('user','affiliate')) THEN RAISE EXCEPTION 'existing_core_role_conflict'; END IF;
  INSERT INTO public.marketing_companies(name, created_by, owner_user_id, contact_name, contact_phone, contact_gender)
  VALUES (nm, uid, uid, pname, pphone, pgender) RETURNING id INTO company;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'marketing_company') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET primary_user_type = 'marketing_company', signup_details = jsonb_build_object('company_name', nm, 'service_area', area) WHERE id = uid;
  UPDATE public.workspace_memberships SET account_type = 'marketing_company' WHERE user_id = uid AND workspace_owner_id = uid;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
  VALUES (uid, 'marketing_company_signup', 'marketing_companies', company::text, jsonb_build_object('name', nm));
  RETURN jsonb_build_object('ok', true, 'company_id', company);
END $$;
REVOKE ALL ON FUNCTION public.complete_marketing_company_signup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_marketing_company_signup(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_add_client(_name text, _contact_name text DEFAULT NULL, _contact_phone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE company uuid := public.owned_marketing_company_id(); dev uuid; nm text := left(btrim(COALESCE(_name,'')), 200);
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'marketing_company_required'; END IF;
  IF nm = '' THEN RAISE EXCEPTION 'invalid_details'; END IF;
  INSERT INTO public.developers(workspace_owner_id, company_name, marketing_company_id, contact_name, contact_phone)
  VALUES (auth.uid(), nm, company, NULLIF(left(btrim(COALESCE(_contact_name,'')),200),''), NULLIF(regexp_replace(COALESCE(_contact_phone,''),'\D','','g'),''))
  RETURNING id INTO dev;
  RETURN dev;
END $$;
REVOKE ALL ON FUNCTION public.marketing_add_client(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_add_client(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_add_project(_developer uuid, _name text, _city text DEFAULT NULL, _status text DEFAULT 'marketing')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE company uuid := public.owned_marketing_company_id(); pid uuid; nm text := left(btrim(COALESCE(_name,'')), 200);
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'marketing_company_required'; END IF;
  IF nm = '' THEN RAISE EXCEPTION 'invalid_details'; END IF;
  IF COALESCE(_status,'') NOT IN ('pre_sale','marketing','construction','sold_out','delivered') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.developers WHERE id = _developer AND marketing_company_id = company) THEN RAISE EXCEPTION 'client_not_found'; END IF;
  INSERT INTO public.developer_projects(workspace_owner_id, developer_id, name, city, status, marketing_company_id, is_public)
  VALUES (auth.uid(), _developer, nm, NULLIF(left(btrim(COALESCE(_city,'')),120),''), _status, company, false)
  RETURNING id INTO pid;
  RETURN pid;
END $$;
REVOKE ALL ON FUNCTION public.marketing_add_project(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_add_project(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_add_unit(_project uuid, _type text, _rooms numeric, _size_sqm numeric, _price numeric, _count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE company uuid := public.owned_marketing_company_id();
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'marketing_company_required'; END IF;
  IF NULLIF(btrim(COALESCE(_type,'')),'') IS NULL OR COALESCE(_count,0) < 1 OR _count > 10000 OR COALESCE(_rooms,0) < 0 OR COALESCE(_price,0) < 0 OR COALESCE(_size_sqm,0) < 0 THEN RAISE EXCEPTION 'invalid_details'; END IF;
  UPDATE public.developer_projects p
  SET apartments = (CASE WHEN jsonb_typeof(p.apartments) = 'array' THEN p.apartments ELSE '[]'::jsonb END) || jsonb_build_array(jsonb_build_object(
        'source_unit_id', gen_random_uuid()::text, 'type', left(btrim(_type),60), 'rooms', _rooms, 'size_sqm', _size_sqm, 'price', NULLIF(_price,0), 'count', _count)),
      updated_at = now()
  WHERE p.id = _project AND (p.marketing_company_id = company OR EXISTS (SELECT 1 FROM public.developers d WHERE d.id = p.developer_id AND d.marketing_company_id = company))
    AND p.workspace_owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.marketing_add_unit(uuid, text, numeric, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_add_unit(uuid, text, numeric, numeric, numeric, integer) TO authenticated;