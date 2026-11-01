ALTER TABLE public.broker_upgrade_requests ADD COLUMN IF NOT EXISTS certificate_path text;

CREATE POLICY "Users upload own broker license docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'broker-license-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own broker license docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'broker-license-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin')));

CREATE OR REPLACE FUNCTION public.request_broker_license_review(_license text, _certificate_path text, _details jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); lic text; request_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  lic := ltrim(regexp_replace(COALESCE(_license,''), '\D', '', 'g'), '0');
  IF lic !~ '^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'invalid_license_format'; END IF;
  IF _certificate_path IS NULL OR split_part(_certificate_path, '/', 1) <> uid::text THEN RAISE EXCEPTION 'certificate_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT id INTO request_id FROM public.broker_upgrade_requests WHERE user_id = uid AND status = 'pending';
  IF request_id IS NULL THEN
    INSERT INTO public.broker_upgrade_requests(user_id, license_number, certificate_path, status, review_note)
    VALUES (uid, lic, _certificate_path, 'pending', 'registry_unmatched_manual_review') RETURNING id INTO request_id;
  ELSE
    UPDATE public.broker_upgrade_requests SET license_number = lic, certificate_path = _certificate_path, created_at = now(), review_note = 'registry_unmatched_manual_review' WHERE id = request_id;
  END IF;
  PERFORM public.ensure_profile_row(uid);
  -- Records intent only; no broker role is granted until a manual admin approval.
  UPDATE public.profiles SET primary_user_type = COALESCE(primary_user_type, 'broker') WHERE id = uid;
  IF _details IS NOT NULL AND jsonb_typeof(_details) = 'object' THEN
    UPDATE public.profiles SET signup_details = jsonb_build_object('office_name', left(btrim(COALESCE(_details->>'office_name','')),200), 'service_area', left(btrim(COALESCE(_details->>'service_area','')),200)) WHERE id = uid AND primary_user_type = 'broker';
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
  VALUES (uid, 'broker_license_manual_review_requested', 'broker_upgrade_requests', request_id::text, jsonb_build_object('license_number', lic));
  PERFORM public.notify_broker_upgrade(uid, request_id, 'pending');
  RETURN jsonb_build_object('ok', true, 'status', 'pending', 'id', request_id);
END $$;
REVOKE ALL ON FUNCTION public.request_broker_license_review(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_broker_license_review(text, text, jsonb) TO authenticated;