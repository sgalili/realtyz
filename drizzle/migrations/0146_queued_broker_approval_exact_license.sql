CREATE OR REPLACE FUNCTION public.finalize_queued_broker_setup(_user_id uuid,_license text,_actor uuid,_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR NOT EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE id=_job AND created_by=_actor AND status IN ('running','paused')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _license !~ '^[1-9][0-9]{3,9}$' OR NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user_id AND created_by=_actor AND first_login_at IS NULL) THEN RAISE EXCEPTION 'invalid_pending_broker'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_license AND user_id<>_user_id) THEN RAISE EXCEPTION 'license_already_approved_for_another_account'; END IF;
 INSERT INTO public.admin_approved_broker_licenses(user_id,license_number,approved_by) VALUES(_user_id,_license,_actor) ON CONFLICT(license_number) DO UPDATE SET approved_by=excluded.approved_by,approved_at=now() WHERE public.admin_approved_broker_licenses.user_id=excluded.user_id;
 UPDATE public.profiles SET broker_license_number=_license WHERE id=_user_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,'managing_broker') ON CONFLICT(user_id,role) DO NOTHING;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_import.manual_approval','profiles',_user_id::text,jsonb_build_object('license',_license,'job',_job));
END $$;
REVOKE ALL ON FUNCTION public.finalize_queued_broker_setup(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_queued_broker_setup(uuid,text,uuid,uuid) TO service_role;