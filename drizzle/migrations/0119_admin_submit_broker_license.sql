CREATE OR REPLACE FUNCTION public.admin_submit_broker_license(_user_id uuid, _license text, _certificate_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _admin uuid := auth.uid(); _id uuid; _lic text := regexp_replace(coalesce(_license,''), '\D', '', 'g');
BEGIN
  IF _admin IS NULL OR NOT public.has_role(_admin, 'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id IS NULL OR length(_lic) < 4 THEN RAISE EXCEPTION 'invalid_license'; END IF;
  IF _certificate_path IS NULL OR _certificate_path NOT LIKE _admin::text || '/%' THEN RAISE EXCEPTION 'certificate_required'; END IF;
  SELECT id INTO _id FROM public.broker_upgrade_requests WHERE user_id = _user_id AND status = 'pending' LIMIT 1;
  IF _id IS NOT NULL THEN
    UPDATE public.broker_upgrade_requests SET license_number = _lic, certificate_path = _certificate_path, review_note = 'registry_unmatched_manual_review' WHERE id = _id;
  ELSE
    INSERT INTO public.broker_upgrade_requests(user_id, license_number, certificate_path, status, review_note)
    VALUES (_user_id, _lic, _certificate_path, 'pending', 'registry_unmatched_manual_review') RETURNING id INTO _id;
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
    VALUES (_admin, 'broker_license_submitted_by_admin', 'broker_upgrade_requests', _id::text, jsonb_build_object('user_id', _user_id, 'license_number', _lic));
  RETURN jsonb_build_object('ok', true, 'id', _id, 'status', 'pending');
END $$;
REVOKE ALL ON FUNCTION public.admin_submit_broker_license(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_submit_broker_license(uuid, text, text) TO authenticated;