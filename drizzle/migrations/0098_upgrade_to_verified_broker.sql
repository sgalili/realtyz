CREATE OR REPLACE FUNCTION public.upgrade_to_verified_broker()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _lic text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT v.license_number INTO _lic FROM public.broker_license_verifications v
   WHERE v.user_id = _uid AND v.verified_at > now() - interval '1 hour';
  IF _lic IS NULL THEN RAISE EXCEPTION 'registry_verification_required'; END IF;
  IF NOT public.official_license_exists(_lic) THEN RAISE EXCEPTION 'invalid_official_license'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.broker_certificate_checks c WHERE c.user_id = _uid AND c.status = 'matched'
      AND c.license_number = _lic AND c.created_at > now() - interval '1 hour') THEN
    RAISE EXCEPTION 'certificate_match_required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));
  UPDATE public.profiles SET broker_license_number = _lic WHERE id = _uid;
  INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.broker_role_suspensions WHERE user_id = _uid;
  INSERT INTO public.audit_logs(user_id, action, details) VALUES (_uid, 'broker_upgrade', jsonb_build_object('license_number', _lic))
    ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'license_number', _lic);
END $$;
REVOKE ALL ON FUNCTION public.upgrade_to_verified_broker() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upgrade_to_verified_broker() TO authenticated;