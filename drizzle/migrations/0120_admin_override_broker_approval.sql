CREATE TABLE IF NOT EXISTS public.admin_approved_broker_licenses (
  license_number text PRIMARY KEY,
  user_id uuid NOT NULL,
  approved_by uuid NOT NULL,
  request_id uuid,
  approved_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_approved_broker_licenses TO service_role;
GRANT SELECT ON public.admin_approved_broker_licenses TO authenticated;
ALTER TABLE public.admin_approved_broker_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin reads overrides" ON public.admin_approved_broker_licenses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.official_license_exists(_number text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT COALESCE(_number ~ '^[1-9][0-9]{0,9}$',false) AND (
  EXISTS(SELECT 1 FROM public.test_broker_licenses WHERE license_number=_number)
  OR EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_number)
  OR EXISTS(SELECT 1 FROM public.official_brokers_registry WHERE license_number=_number AND source_url='https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6' AND source_updated_at > now()-interval '7 days' AND source_updated_at <= now()+interval '1 minute' AND extract(year from source_updated_at)=extract(year from now()))) $function$;

CREATE OR REPLACE FUNCTION public.review_broker_upgrade_request(_id uuid, _approve boolean, _note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _admin uuid := auth.uid(); _r public.broker_upgrade_requests; _l record; _published int := 0; _failed int := 0;
BEGIN
  IF _admin IS NULL OR NOT public.has_role(_admin, 'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _r FROM public.broker_upgrade_requests WHERE id = _id FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF _approve THEN
    IF COALESCE(_r.license_number,'') !~ '^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'invalid_license_format'; END IF;
    -- Super Admin manual approval overrides registry lookup failures (audited below).
    INSERT INTO public.admin_approved_broker_licenses(license_number, user_id, approved_by, request_id)
      VALUES (_r.license_number, _r.user_id, _admin, _r.id)
      ON CONFLICT (license_number) DO UPDATE SET user_id = EXCLUDED.user_id, approved_by = EXCLUDED.approved_by, request_id = EXCLUDED.request_id, approved_at = now();
    UPDATE public.profiles SET broker_license_number = _r.license_number WHERE id = _r.user_id;
    INSERT INTO public.user_roles(user_id, role) VALUES (_r.user_id, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.broker_role_suspensions WHERE user_id = _r.user_id;
  END IF;
  UPDATE public.broker_upgrade_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewer_id = _admin, review_note = _note, reviewed_at = now() WHERE id = _id;
  IF _approve THEN
    FOR _l IN SELECT id FROM public.listings
      WHERE user_id = _r.user_id AND is_published = false AND status = 'pending'
        AND COALESCE(features->>'awaiting_license_approval','') = 'true'
    LOOP
      BEGIN
        UPDATE public.listings SET status = 'live', is_published = true, affiliate_enabled = true,
          features = features - 'awaiting_license_approval' WHERE id = _l.id;
        _published := _published + 1;
      EXCEPTION WHEN others THEN
        _failed := _failed + 1;
        UPDATE public.listings SET source_metadata = COALESCE(source_metadata,'{}'::jsonb) || jsonb_build_object('publication_error', left(SQLERRM, 300)) WHERE id = _l.id;
      END;
    END LOOP;
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
    VALUES (_admin, CASE WHEN _approve THEN 'broker_upgrade_approved_override' ELSE 'broker_upgrade_rejected' END, 'broker_upgrade_requests', _id::text,
      jsonb_build_object('user_id', _r.user_id, 'license_number', _r.license_number, 'note', _note, 'auto_published', _published, 'publish_failed', _failed,
        'registry_matched', EXISTS(SELECT 1 FROM public.official_brokers_registry WHERE license_number=_r.license_number)));
  PERFORM public.notify_broker_upgrade(_r.user_id, _id, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END);
  RETURN jsonb_build_object('ok', true, 'published', _published, 'failed', _failed);
END $function$;