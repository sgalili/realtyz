CREATE OR REPLACE FUNCTION public.register_as_broker(_display_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 _uid uuid := auth.uid(); _profile_name text; _profile_phone text; _profile_email text; _lead_id uuid; _warn text; _license text;
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,0));
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('agent','lead_agent','managing_broker','super_admin')) THEN
  SELECT license_number INTO _license FROM public.broker_license_verifications
   WHERE user_id=_uid AND verified_at > now()-interval '24 hours'
   AND source_updated_at > now()-interval '7 days'
   AND source_url='https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6';
  IF _license IS NULL THEN SELECT license_number INTO _license FROM public.test_broker_licenses WHERE user_id=_uid; END IF;
  IF _license IS NULL THEN RAISE EXCEPTION 'broker_license_registry_verification_required'; END IF;
 END IF;
 PERFORM public.ensure_profile_row(_uid);
 IF _license IS NOT NULL THEN UPDATE public.profiles SET broker_license_number=_license WHERE id=_uid; END IF;
 INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'agent'::public.app_role) ON CONFLICT (user_id,role) DO NOTHING;
 DELETE FROM public.broker_role_suspensions WHERE user_id=_uid AND EXISTS(SELECT 1 FROM public.test_broker_licenses t WHERE t.user_id=_uid);
 IF _display_name IS NOT NULL AND btrim(_display_name)<>'' THEN
  UPDATE public.profiles SET full_name=COALESCE(NULLIF(btrim(full_name),''),btrim(_display_name)) WHERE id=_uid;
 END IF;
 SELECT full_name,phone,email INTO _profile_name,_profile_phone,_profile_email FROM public.profiles WHERE id=_uid;
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_uid) OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='agent') THEN RAISE EXCEPTION 'broker_registration_incomplete'; END IF;
 IF NULLIF(regexp_replace(COALESCE(_profile_phone,''),'\D','','g'),'') IS NOT NULL THEN
  BEGIN
   _lead_id:=public.ensure_rita_crm_contact(_profile_name,_profile_phone,_profile_email,'הרשמת מתווך לאפליקציה','app_registration',_uid);
  EXCEPTION WHEN OTHERS THEN _warn:=SQLERRM; RAISE LOG 'broker CRM contact provisioning failed user=% error=%',_uid,SQLERRM;
  END;
 ELSE _warn:='registration_phone_missing'; END IF;
 RETURN jsonb_build_object('ok',true,'user_id',_uid,'role','agent','lead_id',_lead_id,'warning',_warn);
END;
$function$;