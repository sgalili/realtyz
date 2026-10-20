CREATE OR REPLACE FUNCTION public.import_crm_leads(_rows jsonb)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
AS $$
DECLARE v_ws uuid := public.current_workspace_owner(); r jsonb; v_id uuid; v_phone text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(v_ws) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows)>1000 THEN RAISE EXCEPTION 'invalid_import_batch'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  v_phone := btrim(r->>'phone_number');
  IF v_phone IS NULL OR v_phone='' THEN RAISE EXCEPTION 'missing_phone_number'; END IF;
  INSERT INTO public.leads AS l (assigned_to,workspace_owner_id,phone_number,full_name,email,city,interest_tag,identity_number,agency_name,operating_area,notes,status,deal_type,preferences)
  VALUES (v_ws,v_ws,v_phone,r->>'full_name',nullif(r->>'email',''),r->>'city',r->>'interest_tag',r->>'identity_number',r->>'agency_name',r->>'operating_area',r->>'notes',coalesce(r->>'status','uploaded'),r->>'deal_type',coalesce(r->'preferences','{}'::jsonb))
  ON CONFLICT (assigned_to, (btrim(phone_number))) WHERE phone_number IS NOT NULL AND btrim(phone_number)<>''
  DO UPDATE SET full_name=coalesce(nullif(EXCLUDED.full_name,''),l.full_name), email=coalesce(EXCLUDED.email,l.email),city=coalesce(nullif(EXCLUDED.city,''),l.city),interest_tag=coalesce(nullif(EXCLUDED.interest_tag,''),l.interest_tag),identity_number=coalesce(nullif(EXCLUDED.identity_number,''),l.identity_number),agency_name=coalesce(nullif(EXCLUDED.agency_name,''),l.agency_name),operating_area=coalesce(nullif(EXCLUDED.operating_area,''),l.operating_area),notes=coalesce(nullif(EXCLUDED.notes,''),l.notes),deal_type=coalesce(EXCLUDED.deal_type,l.deal_type),preferences=coalesce(l.preferences,'{}'::jsonb)||EXCLUDED.preferences
  WHERE l.workspace_owner_id=v_ws
  RETURNING l.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'import_conflict_outside_workspace'; END IF;
  id:=v_id; RETURN NEXT;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.import_crm_leads(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_crm_leads(jsonb) TO authenticated;