CREATE TABLE public.broker_license_grace (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_number text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  expired_at timestamptz
);
GRANT SELECT ON public.broker_license_grace TO authenticated;
GRANT ALL ON public.broker_license_grace TO service_role;
ALTER TABLE public.broker_license_grace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own grace read" ON public.broker_license_grace FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.start_broker_signup_grace(_license text, _details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); lic text; saved text; ends timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  lic := ltrim(regexp_replace(COALESCE(_license,''), '\D', '', 'g'), '0');
  IF lic !~ '^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'invalid_license_format'; END IF;
  IF _details IS NULL OR jsonb_typeof(_details) <> 'object'
     OR NULLIF(btrim(COALESCE(_details->>'office_name','')),'') IS NULL
     OR NULLIF(btrim(COALESCE(_details->>'service_area','')),'') IS NULL THEN RAISE EXCEPTION 'invalid_details'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
  IF NOT public.publisher_sms_verified() THEN RAISE EXCEPTION 'broker_sms_verification_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.broker_role_suspensions WHERE user_id = uid) THEN RAISE EXCEPTION 'broker_license_registry_verification_required'; END IF;
  PERFORM public.ensure_profile_row(uid);
  SELECT primary_user_type INTO saved FROM public.profiles WHERE id = uid FOR UPDATE;
  IF saved IS NOT NULL AND saved <> 'broker' THEN RAISE EXCEPTION 'primary_type_already_selected'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role NOT IN ('user','affiliate','agent')) THEN RAISE EXCEPTION 'existing_core_role_conflict'; END IF;
  IF EXISTS (SELECT 1 FROM public.broker_license_grace WHERE user_id = uid) THEN
    SELECT expires_at INTO ends FROM public.broker_license_grace WHERE user_id = uid;
    IF ends < now() THEN RAISE EXCEPTION 'broker_grace_expired'; END IF;
  ELSE
    ends := now() + interval '14 days';
    INSERT INTO public.broker_license_grace(user_id, license_number, expires_at) VALUES (uid, lic, ends);
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET primary_user_type = 'broker',
    signup_details = jsonb_build_object('office_name', left(btrim(_details->>'office_name'),200), 'service_area', left(btrim(_details->>'service_area'),200))
  WHERE id = uid;
  UPDATE public.workspace_memberships SET account_type = 'real_estate' WHERE user_id = uid AND workspace_owner_id = uid;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
  VALUES (uid, 'broker_signup_grace_started', 'broker_license_grace', uid::text, jsonb_build_object('license_number', lic, 'expires_at', ends));
  RETURN jsonb_build_object('ok', true, 'expires_at', ends);
END $$;
REVOKE ALL ON FUNCTION public.start_broker_signup_grace(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_broker_signup_grace(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_broker_license_grace()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; n integer := 0; lic text;
BEGIN
  FOR g IN SELECT * FROM public.broker_license_grace WHERE resolved_at IS NULL AND expired_at IS NULL LOOP
    SELECT broker_license_number INTO lic FROM public.profiles WHERE id = g.user_id;
    IF (lic IS NOT NULL AND public.broker_license_approved_for(g.user_id, lic))
       OR EXISTS (SELECT 1 FROM public.admin_approved_broker_licenses a WHERE a.user_id = g.user_id)
       OR EXISTS (SELECT 1 FROM public.broker_upgrade_requests r WHERE r.user_id = g.user_id AND r.status = 'approved') THEN
      UPDATE public.broker_license_grace SET resolved_at = now() WHERE user_id = g.user_id;
    ELSIF g.expires_at < now() THEN
      DELETE FROM public.user_roles WHERE user_id = g.user_id AND role = 'agent';
      UPDATE public.broker_license_grace SET expired_at = now() WHERE user_id = g.user_id;
      INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
      VALUES (g.user_id, 'broker_signup_grace_expired', 'broker_license_grace', g.user_id::text, '{}'::jsonb);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_broker_license_grace() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('expire-broker-license-grace', '7 * * * *', 'select public.expire_broker_license_grace()');