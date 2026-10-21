CREATE TABLE public.broker_license_verifications (
 user_id uuid PRIMARY KEY,
 license_number text NOT NULL,
 registry_holder_name text NOT NULL,
 source_url text NOT NULL,
 source_updated_at timestamptz NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT broker_license_numeric CHECK (license_number ~ '^[1-9][0-9]{0,9}$'),
 CONSTRAINT broker_license_official_source CHECK (source_url = 'https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6')
);
GRANT SELECT ON public.broker_license_verifications TO authenticated;
GRANT ALL ON public.broker_license_verifications TO service_role;
ALTER TABLE public.broker_license_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_verification_self_read ON public.broker_license_verifications FOR SELECT TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.broker_license_verifications IS 'Server-only evidence from official Ministry of Justice active-broker dataset; not user-editable profile data.';

CREATE OR REPLACE FUNCTION public.register_as_broker(_display_name text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF _license IS NULL THEN RAISE EXCEPTION 'broker_license_registry_verification_required'; END IF;
 END IF;
 PERFORM public.ensure_profile_row(_uid);
 IF _license IS NOT NULL THEN UPDATE public.profiles SET broker_license_number=_license WHERE id=_uid; END IF;
 INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'agent'::public.app_role) ON CONFLICT (user_id,role) DO NOTHING;
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
REVOKE ALL ON FUNCTION public.register_as_broker(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_broker(text) TO authenticated,service_role;