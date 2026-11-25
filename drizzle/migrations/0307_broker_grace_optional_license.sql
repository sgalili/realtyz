CREATE OR REPLACE FUNCTION public.start_broker_signup_grace(_license text, _details jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); lic text; saved text; ends timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  lic := ltrim(regexp_replace(COALESCE(_license,''), '\D', '', 'g'), '0');
  IF lic !~ '^[1-9][0-9]{0,9}$' THEN lic := ''; END IF;
  IF _details IS NULL OR jsonb_typeof(_details) <> 'object'
     OR NULLIF(btrim(COALESCE(_details->>'office_name','')),'') IS NULL
     OR NULLIF(btrim(COALESCE(_details->>'service_area','')),'') IS NULL THEN RAISE EXCEPTION 'invalid_details'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
  IF NOT public.publisher_sms_verified() AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = uid AND phone_confirmed_at IS NOT NULL AND COALESCE(phone,'') <> '') THEN RAISE EXCEPTION 'broker_sms_verification_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.broker_role_suspensions WHERE user_id = uid) THEN RAISE EXCEPTION 'broker_license_registry_verification_required'; END IF;
  PERFORM public.ensure_profile_row(uid);
  SELECT primary_user_type INTO saved FROM public.profiles WHERE id = uid FOR UPDATE;
  IF saved IS NOT NULL AND saved <> 'broker' THEN RAISE EXCEPTION 'primary_type_already_selected'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role NOT IN ('user','affiliate','agent')) THEN RAISE EXCEPTION 'existing_core_role_conflict'; END IF;
  IF EXISTS (SELECT 1 FROM public.broker_license_grace WHERE user_id = uid) THEN
    SELECT expires_at INTO ends FROM public.broker_license_grace WHERE user_id = uid;
    IF ends < now() THEN RAISE EXCEPTION 'broker_grace_expired'; END IF;
  ELSE
    ends := now() + interval '14 days';
    INSERT INTO public.broker_license_grace(user_id, license_number, expires_at) VALUES (uid, lic, ends);
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET primary_user_type = 'broker',
    signup_details = jsonb_build_object('office_name', left(btrim(_details->>'office_name'),200), 'service_area', left(btrim(_details->>'service_area'),200))
  WHERE id = uid;
  UPDATE public.workspace_memberships SET account_type = 'real_estate' WHERE user_id = uid AND workspace_owner_id = uid;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
  VALUES (uid, 'broker_signup_grace_started', 'broker_license_grace', uid::text, jsonb_build_object('license_number', lic, 'expires_at', ends));
  RETURN jsonb_build_object('ok', true, 'expires_at', ends);
END $function$;