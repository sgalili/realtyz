CREATE OR REPLACE FUNCTION public.finalize_queued_broker_setup(_user_id uuid, _license text, _actor uuid, _job uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR NOT EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE id=_job AND created_by=_actor AND status IN ('running','paused')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _license !~ '^[1-9][0-9]{3,9}$' OR NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user_id AND created_by=_actor AND first_login_at IS NULL) THEN RAISE EXCEPTION 'invalid_pending_broker'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_license AND user_id<>_user_id)
    OR EXISTS(SELECT 1 FROM public.profiles WHERE broker_license_number=_license AND id<>_user_id)
    OR EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE imported_license_number=_license AND user_id<>_user_id) THEN RAISE EXCEPTION 'license_already_approved_for_another_account'; END IF;
 UPDATE public.admin_broker_onboarding SET imported_license_number=_license WHERE user_id=_user_id;
 -- Parked broker role: complete_official_license_verification restores it once the registry confirms the license.
 INSERT INTO public.broker_role_suspensions(user_id,role,reason) VALUES(_user_id,'managing_broker','imported_license_pending_verification') ON CONFLICT(user_id,role) DO NOTHING;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_import.license_stored_unverified','admin_broker_onboarding',_user_id::text,jsonb_build_object('license',_license,'job',_job));
END $function$;