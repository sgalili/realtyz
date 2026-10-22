CREATE OR REPLACE FUNCTION public.select_signup_user_type(_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE uid uuid:=auth.uid(); expected public.app_role; saved text; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF _type NOT IN ('broker','developer','contractor','property_owner','property_seeker','partner') OR _type IS NULL THEN RAISE EXCEPTION 'invalid_signup_type'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 expected:=CASE _type WHEN 'broker' THEN 'agent'::public.app_role WHEN 'developer' THEN 'developer'::public.app_role WHEN 'contractor' THEN 'developer'::public.app_role WHEN 'property_owner' THEN 'property_owner'::public.app_role WHEN 'partner' THEN 'affiliate'::public.app_role ELSE 'property_seeker'::public.app_role END;
 PERFORM public.ensure_profile_row(uid);
 SELECT primary_user_type INTO saved FROM public.profiles WHERE id=uid FOR UPDATE;
 IF saved IS NOT NULL AND saved<>_type THEN RAISE EXCEPTION 'primary_type_already_selected'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=uid AND role NOT IN ('user','affiliate',expected)) THEN RAISE EXCEPTION 'existing_core_role_conflict'; END IF;
 IF _type='broker' THEN result:=public.register_as_broker(NULL);
 ELSIF _type IN ('developer','contractor') THEN result:=public.register_as_developer(NULL);
 ELSIF _type='property_owner' THEN result:=public.register_as_property_owner(NULL);
 ELSIF _type='partner' THEN result:=public.register_as_affiliate(NULL,NULL);
 ELSE result:=public.register_as_property_seeker(NULL); END IF;
 IF COALESCE((result->>'ok')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'signup_type_incomplete'; END IF;
 UPDATE public.profiles SET primary_user_type=_type WHERE id=uid;
 UPDATE public.workspace_memberships SET account_type=CASE WHEN _type IN ('developer','contractor') THEN _type WHEN _type='broker' THEN 'real_estate' ELSE _type END WHERE user_id=uid AND workspace_owner_id=uid;
 RETURN jsonb_build_object('ok',true,'type',_type,'role',expected);
END $function$;
REVOKE ALL ON FUNCTION public.select_signup_user_type(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_signup_user_type(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.complete_signup_profile(_full_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE uid uuid:=auth.uid(); saved_name text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF _full_name IS NULL OR length(btrim(_full_name)) NOT BETWEEN 1 AND 200 OR position('@' in _full_name)>0 THEN RAISE EXCEPTION 'invalid_full_name'; END IF;
 PERFORM public.ensure_profile_row(uid);
 UPDATE public.profiles SET full_name=btrim(_full_name) WHERE id=uid AND (NULLIF(btrim(full_name),'') IS NULL OR full_name ~* '@.*\.(invalid|local|test)$');
 SELECT full_name INTO saved_name FROM public.profiles WHERE id=uid;
 RETURN jsonb_build_object('ok',true,'full_name',saved_name);
END $function$;
REVOKE ALL ON FUNCTION public.complete_signup_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_signup_profile(text) TO authenticated, service_role;