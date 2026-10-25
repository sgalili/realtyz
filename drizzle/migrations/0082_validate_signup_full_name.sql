CREATE OR REPLACE FUNCTION public.valid_signup_full_name(_full_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO public AS $function$
 SELECT _full_name IS NOT NULL
 AND length(btrim(_full_name)) BETWEEN 1 AND 200
 AND position('@' in _full_name)=0
 AND cardinality(regexp_split_to_array(btrim(_full_name), '[[:space:]]+')) >= 2
 AND NOT EXISTS (
  SELECT 1 FROM unnest(regexp_split_to_array(btrim(_full_name), '[[:space:]]+')) AS word
  WHERE length(regexp_replace(word, '[^[:alpha:]]', '', 'g')) < 2
 );
$function$;
REVOKE ALL ON FUNCTION public.valid_signup_full_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valid_signup_full_name(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.complete_signup_profile(_full_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE uid uuid:=auth.uid(); saved_name text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF public.valid_signup_full_name(_full_name) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_full_name'; END IF;
 PERFORM public.ensure_profile_row(uid);
 UPDATE public.profiles SET full_name=btrim(_full_name) WHERE id=uid AND (NULLIF(btrim(full_name),'') IS NULL OR full_name ~* '@.*\.(invalid|local|test)$');
 SELECT full_name INTO saved_name FROM public.profiles WHERE id=uid;
 RETURN jsonb_build_object('ok',true,'full_name',saved_name);
END $function$;
REVOKE ALL ON FUNCTION public.complete_signup_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_signup_profile(text) TO authenticated, service_role;