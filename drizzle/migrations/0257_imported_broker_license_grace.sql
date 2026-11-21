ALTER TABLE public.admin_broker_onboarding
  ADD COLUMN IF NOT EXISTS license_grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_blocked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.broker_license_grace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  grace_days integer NOT NULL DEFAULT 14 CHECK (grace_days BETWEEN 1 AND 180),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.broker_license_grace_settings TO authenticated;
GRANT ALL ON public.broker_license_grace_settings TO service_role;
ALTER TABLE public.broker_license_grace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY grace_settings_read ON public.broker_license_grace_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.broker_license_grace_settings(id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_broker_license_grace_days(_days integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 180 THEN RAISE EXCEPTION 'invalid_grace_days'; END IF;
  INSERT INTO public.broker_license_grace_settings(id,grace_days,updated_at,updated_by) VALUES (true,_days,now(),auth.uid())
    ON CONFLICT (id) DO UPDATE SET grace_days=excluded.grace_days, updated_at=now(), updated_by=auth.uid();
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'broker_license_grace_days_updated','broker_license_grace_settings','true',jsonb_build_object('grace_days',_days));
  RETURN _days;
END $$;
REVOKE ALL ON FUNCTION public.set_broker_license_grace_days(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_broker_license_grace_days(integer) TO authenticated;

-- Imports store the license as-is; no approval is granted at import time.
CREATE OR REPLACE FUNCTION public.finalize_queued_broker_setup(_user_id uuid, _license text, _actor uuid, _job uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR NOT EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE id=_job AND created_by=_actor AND status IN ('running','paused')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _license !~ '^[1-9][0-9]{3,9}$' OR NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user_id AND created_by=_actor AND first_login_at IS NULL) THEN RAISE EXCEPTION 'invalid_pending_broker'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_license AND user_id<>_user_id)
    OR EXISTS(SELECT 1 FROM public.profiles WHERE broker_license_number=_license AND id<>_user_id) THEN RAISE EXCEPTION 'license_already_approved_for_another_account'; END IF;
 UPDATE public.profiles SET broker_license_number=_license WHERE id=_user_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,'managing_broker') ON CONFLICT(user_id,role) DO NOTHING;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_import.license_stored_unverified','profiles',_user_id::text,jsonb_build_object('license',_license,'job',_job));
END $function$;

CREATE OR REPLACE FUNCTION public.imported_broker_license_verified(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_verified_broker_license(_uid)
    OR EXISTS(SELECT 1 FROM public.admin_broker_onboarding o WHERE o.user_id=_uid AND o.license_verified_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses a WHERE a.user_id=_uid)
$$;
REVOKE ALL ON FUNCTION public.imported_broker_license_verified(uuid) FROM PUBLIC, anon, authenticated;

-- First sign-in no longer requires a verified license; the grace period starts here.
CREATE OR REPLACE FUNCTION public.complete_admin_broker_first_login()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid:=auth.uid(); _pending boolean; _days integer;
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT first_login_at IS NULL INTO _pending FROM public.admin_broker_onboarding WHERE user_id=_uid FOR UPDATE;
 IF NOT coalesce(_pending,false) THEN RETURN '/'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_memberships WHERE user_id=_uid AND workspace_owner_id=_uid) THEN RAISE EXCEPTION 'workspace_forbidden'; END IF;
 PERFORM public.set_active_workspace(_uid);
 SELECT grace_days INTO _days FROM public.broker_license_grace_settings WHERE id;
 UPDATE public.admin_broker_onboarding SET first_login_at=now(),
   license_grace_started_at=CASE WHEN coalesce(import_source,'')<>'developer_import' AND NOT public.imported_broker_license_verified(_uid) THEN coalesce(license_grace_started_at,now()) ELSE license_grace_started_at END,
   license_grace_ends_at=CASE WHEN coalesce(import_source,'')<>'developer_import' AND NOT public.imported_broker_license_verified(_uid) THEN coalesce(license_grace_ends_at,now()+make_interval(days=>coalesce(_days,14))) ELSE license_grace_ends_at END
 WHERE user_id=_uid;
 RETURN '/properties';
END $function$;

CREATE OR REPLACE FUNCTION public.imported_broker_license_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); o public.admin_broker_onboarding; _days integer; _verified boolean; _pending boolean; _lic text;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.admin_broker_onboarding WHERE user_id=_uid FOR UPDATE;
  IF NOT FOUND OR o.first_login_at IS NULL OR coalesce(o.import_source,'')='developer_import' OR public.has_role(_uid,'super_admin') THEN RETURN NULL; END IF;
  _verified := public.imported_broker_license_verified(_uid);
  SELECT broker_license_number INTO _lic FROM public.profiles WHERE id=_uid;
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

-- Registry could not confirm: route to the existing Super Admin review queue.
CREATE OR REPLACE FUNCTION public.request_imported_license_review(_license text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _lic text:=regexp_replace(coalesce(_license,''),'^0+',''); _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_uid AND first_login_at IS NOT NULL AND coalesce(import_source,'')<>'developer_import') THEN RAISE EXCEPTION 'not_imported_account'; END IF;
  IF _lic !~ '^[1-9][0-9]{3,9}$' THEN RAISE EXCEPTION 'invalid_license_format'; END IF;
  IF EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_lic AND user_id<>_uid) OR EXISTS(SELECT 1 FROM public.profiles WHERE broker_license_number=_lic AND id<>_uid) THEN RAISE EXCEPTION 'license_already_approved_for_another_account'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,0));
  SELECT id INTO _id FROM public.broker_upgrade_requests WHERE user_id=_uid AND status='pending';
  IF _id IS NULL THEN
    INSERT INTO public.broker_upgrade_requests(user_id,license_number,status,review_note) VALUES(_uid,_lic,'pending','imported_account_registry_unverified') RETURNING id INTO _id;
  ELSE
    UPDATE public.broker_upgrade_requests SET license_number=_lic, created_at=now(), review_note='imported_account_registry_unverified' WHERE id=_id;
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_uid,'imported_broker_license_review_requested','broker_upgrade_requests',_id::text,jsonb_build_object('license_number',_lic));
  BEGIN PERFORM public.notify_broker_upgrade(_uid,_id,'pending'); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'id',_id,'status','pending');
END $$;
REVOKE ALL ON FUNCTION public.request_imported_license_review(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_imported_license_review(text) TO authenticated;