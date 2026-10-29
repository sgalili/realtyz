CREATE TABLE public.broker_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  license_number text NOT NULL,
  registry_holder_name text,
  certificate_name text,
  certificate_check_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX broker_upgrade_requests_one_pending ON public.broker_upgrade_requests(user_id) WHERE status = 'pending';
GRANT SELECT ON public.broker_upgrade_requests TO authenticated;
GRANT ALL ON public.broker_upgrade_requests TO service_role;
ALTER TABLE public.broker_upgrade_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or super admin read" ON public.broker_upgrade_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.submit_broker_upgrade_request()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _v record; _c record; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT license_number, registry_holder_name INTO _v FROM public.broker_license_verifications WHERE user_id = _uid;
  IF _v.license_number IS NULL THEN RAISE EXCEPTION 'registry_verification_required'; END IF;
  IF NOT public.official_license_exists(_v.license_number) THEN RAISE EXCEPTION 'invalid_official_license'; END IF;
  SELECT id, certificate_name INTO _c FROM public.broker_certificate_checks
    WHERE user_id = _uid AND status = 'matched' AND license_number = _v.license_number ORDER BY created_at DESC LIMIT 1;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'certificate_match_required'; END IF;
  SELECT id INTO _id FROM public.broker_upgrade_requests WHERE user_id = _uid AND status = 'pending';
  IF _id IS NULL THEN
    INSERT INTO public.broker_upgrade_requests(user_id, license_number, registry_holder_name, certificate_name, certificate_check_id)
      VALUES (_uid, _v.license_number, _v.registry_holder_name, _c.certificate_name, _c.id) RETURNING id INTO _id;
  ELSE
    UPDATE public.broker_upgrade_requests SET license_number = _v.license_number, registry_holder_name = _v.registry_holder_name,
      certificate_name = _c.certificate_name, certificate_check_id = _c.id, created_at = now() WHERE id = _id;
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
    VALUES (_uid, 'broker_upgrade_requested', 'broker_upgrade_requests', _id::text, jsonb_build_object('license_number', _v.license_number, 'status', 'pending'));
  RETURN jsonb_build_object('ok', true, 'status', 'pending', 'id', _id);
END $$;

CREATE OR REPLACE FUNCTION public.review_broker_upgrade_request(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin uuid := auth.uid(); _r public.broker_upgrade_requests;
BEGIN
  IF _admin IS NULL OR NOT public.has_role(_admin, 'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _r FROM public.broker_upgrade_requests WHERE id = _id FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF _approve THEN
    IF NOT public.official_license_exists(_r.license_number) THEN RAISE EXCEPTION 'invalid_official_license'; END IF;
    UPDATE public.profiles SET broker_license_number = _r.license_number WHERE id = _r.user_id;
    INSERT INTO public.user_roles(user_id, role) VALUES (_r.user_id, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.broker_role_suspensions WHERE user_id = _r.user_id;
  END IF;
  UPDATE public.broker_upgrade_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewer_id = _admin, review_note = _note, reviewed_at = now() WHERE id = _id;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
    VALUES (_admin, CASE WHEN _approve THEN 'broker_upgrade_approved' ELSE 'broker_upgrade_rejected' END, 'broker_upgrade_requests', _id::text,
      jsonb_build_object('user_id', _r.user_id, 'license_number', _r.license_number, 'note', _note));
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.submit_broker_upgrade_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_broker_upgrade_request() TO authenticated;
REVOKE ALL ON FUNCTION public.review_broker_upgrade_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_broker_upgrade_request(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upgrade_to_verified_broker() FROM authenticated;
COMMENT ON FUNCTION public.upgrade_to_verified_broker() IS 'DEPRECATED: replaced by submit_broker_upgrade_request + review_broker_upgrade_request (manual approval).';