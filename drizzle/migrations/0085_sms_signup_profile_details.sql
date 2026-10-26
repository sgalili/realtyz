ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.complete_sms_signup(_first_name text, _last_name text, _gender text, _phone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); verified_phone text; normalized text:=regexp_replace(_phone,'[\s()+-]','','g');
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF _first_name IS NULL OR _last_name IS NULL OR length(btrim(_first_name)) NOT BETWEEN 2 AND 80 OR length(btrim(_last_name)) NOT BETWEEN 2 AND 80 OR btrim(_first_name) !~ '^[[:alpha:]]+$' OR btrim(_last_name) !~ '^[[:alpha:]]+$' THEN RAISE EXCEPTION 'invalid_name'; END IF;
 IF _gender IS NULL OR _gender NOT IN ('male','female') THEN RAISE EXCEPTION 'invalid_gender'; END IF;
 IF normalized ~ '^05[0-9]{8}$' THEN normalized:='972'||substr(normalized,2); END IF;
 IF normalized !~ '^9725[0-9]{8}$' THEN RAISE EXCEPTION 'invalid_mobile'; END IF;
 SELECT regexp_replace(phone,'[^0-9]','','g') INTO verified_phone FROM auth.users WHERE id=uid AND phone_confirmed_at IS NOT NULL;
 IF verified_phone IS DISTINCT FROM normalized THEN RAISE EXCEPTION 'verified_phone_required'; END IF;
 PERFORM public.ensure_profile_row(uid);
 PERFORM public.complete_signup_profile(btrim(_first_name)||' '||btrim(_last_name));
 UPDATE public.profiles SET gender=COALESCE(gender,_gender), phone=COALESCE(NULLIF(phone,''),normalized), signup_details=CASE WHEN primary_user_type IS NULL THEN signup_details||jsonb_build_object('first_name',btrim(_first_name),'last_name',btrim(_last_name)) ELSE signup_details END WHERE id=uid;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.complete_sms_signup(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_sms_signup(text,text,text,text) TO authenticated;
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