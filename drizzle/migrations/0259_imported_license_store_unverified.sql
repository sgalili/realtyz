ALTER TABLE public.admin_broker_onboarding ADD COLUMN IF NOT EXISTS imported_license_number text;

CREATE OR REPLACE FUNCTION public.finalize_queued_broker_setup(_user_id uuid, _license text, _actor uuid, _job uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR NOT EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE id=_job AND created_by=_actor AND status IN ('running','paused')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _license !~ '^[1-9][0-9]{3,9}$' OR NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user_id AND created_by=_actor AND first_login_at IS NULL) THEN RAISE EXCEPTION 'invalid_pending_broker'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_license AND user_id<>_user_id)
    OR EXISTS(SELECT 1 FROM public.profiles WHERE broker_license_number=_license AND id<>_user_id)
    OR EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE imported_license_number=_license AND user_id<>_user_id) THEN RAISE EXCEPTION 'license_already_approved_for_another_account'; END IF;
 -- Unverified: kept off profiles.broker_license_number and no broker role until registry/Super Admin verification.
 UPDATE public.admin_broker_onboarding SET imported_license_number=_license WHERE user_id=_user_id;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_import.license_stored_unverified','admin_broker_onboarding',_user_id::text,jsonb_build_object('license',_license,'job',_job));
END $function$;

CREATE OR REPLACE FUNCTION public.imported_broker_license_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); o public.admin_broker_onboarding; _days integer; _verified boolean; _pending boolean; _lic text;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.admin_broker_onboarding WHERE user_id=_uid FOR UPDATE;
  IF NOT FOUND OR o.first_login_at IS NULL OR coalesce(o.import_source,'')='developer_import' OR public.has_role(_uid,'super_admin') THEN RETURN NULL; END IF;
  _verified := public.imported_broker_license_verified(_uid);
  SELECT coalesce(nullif(broker_license_number,''),o.imported_license_number) INTO _lic FROM public.profiles WHERE id=_uid;
  IF _verified THEN
    IF o.license_verified_at IS NULL OR o.license_blocked_at IS NOT NULL THEN
      UPDATE public.admin_broker_onboarding SET license_verified_at=coalesce(license_verified_at,now()), license_blocked_at=NULL WHERE user_id=_uid;
    END IF;
    RETURN jsonb_build_object('status','verified','license_number',_lic);
  END IF;
  IF o.license_grace_ends_at IS NULL THEN
    SELECT grace_days INTO _days FROM public.broker_license_grace_settings WHERE id;
    UPDATE public.admin_broker_onboarding SET license_grace_started_at=now(), license_grace_ends_at=now()+make_interval(days=>coalesce(_days,14)) WHERE user_id=_uid RETURNING * INTO o;
  END IF;
  _pending := EXISTS(SELECT 1 FROM public.broker_upgrade_requests WHERE user_id=_uid AND status='pending');
  IF o.license_grace_ends_at <= now() THEN
    IF o.license_blocked_at IS NULL THEN
      INSERT INTO public.broker_role_suspensions(user_id,role,reason)
        SELECT user_id,role,'imported_license_grace_expired' FROM public.user_roles WHERE user_id=_uid AND role IN ('agent','lead_agent','managing_broker','junior_agent')
        ON CONFLICT(user_id,role) DO NOTHING;
      DELETE FROM public.user_roles WHERE user_id=_uid AND role IN ('agent','lead_agent','managing_broker','junior_agent');
      UPDATE public.admin_broker_onboarding SET license_blocked_at=now() WHERE user_id=_uid;
      INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(NULL,'imported_broker_license_grace_expired','profiles',_uid::text,jsonb_build_object('license',_lic));
    END IF;
    RETURN jsonb_build_object('status','blocked','license_number',_lic,'review_pending',_pending,'grace_ends_at',o.license_grace_ends_at);
  END IF;
  RETURN jsonb_build_object('status',CASE WHEN _pending THEN 'pending_review' ELSE 'unverified' END,'license_number',_lic,'review_pending',_pending,
    'grace_started_at',o.license_grace_started_at,'grace_ends_at',o.license_grace_ends_at,
    'days_left',greatest(0,ceil(extract(epoch FROM (o.license_grace_ends_at-now()))/86400)::int));
END $$;
REVOKE ALL ON FUNCTION public.imported_broker_license_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imported_broker_license_state() TO authenticated;