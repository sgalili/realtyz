CREATE OR REPLACE FUNCTION public.complete_sms_signup_details(_type text, _details jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); required_keys text[]; key text; clean jsonb:='{}'; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF _type IS NULL OR _type NOT IN ('property_owner','property_seeker','broker','developer','partner') THEN RAISE EXCEPTION 'invalid_signup_type'; END IF;
 IF _details IS NULL OR jsonb_typeof(_details)<>'object' THEN RAISE EXCEPTION 'invalid_details'; END IF;
 required_keys:=CASE _type WHEN 'property_owner' THEN ARRAY['property_area','property_type'] WHEN 'property_seeker' THEN ARRAY['search_area','budget'] WHEN 'broker' THEN ARRAY['office_name','service_area'] WHEN 'developer' THEN ARRAY['company_name','main_project'] ELSE ARRAY['marketing_channel'] END;
 FOREACH key IN ARRAY required_keys LOOP
  IF NULLIF(btrim(_details->>key),'') IS NULL OR length(_details->>key)>200 OR jsonb_typeof(_details->key)<>'string' THEN RAISE EXCEPTION 'invalid_details'; END IF;
  clean:=clean||jsonb_build_object(key,btrim(_details->>key));
 END LOOP;
 IF _type='property_owner' AND _details ? 'deal_type' THEN
  IF jsonb_typeof(_details->'deal_type') <> 'string' OR (_details->>'deal_type') NOT IN ('sale','rent') THEN RAISE EXCEPTION 'invalid_deal_type'; END IF;
  clean:=clean||jsonb_build_object('deal_type',_details->>'deal_type');
 END IF;
 IF _type='property_seeker' THEN
  IF (clean->>'budget') !~ '^[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'invalid_budget'; END IF;
  IF (clean->>'budget')::numeric<=0 OR (clean->>'budget')::numeric>1000000000000 THEN RAISE EXCEPTION 'invalid_budget'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND primary_user_type IS NOT NULL) THEN RAISE EXCEPTION 'primary_type_already_selected'; END IF;
 result:=public.select_signup_user_type(_type);
 UPDATE public.profiles SET signup_details=signup_details||clean WHERE id=uid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.complete_sms_signup_details(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_sms_signup_details(text,jsonb) TO authenticated;