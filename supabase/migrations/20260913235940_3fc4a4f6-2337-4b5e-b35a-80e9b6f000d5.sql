CREATE OR REPLACE FUNCTION public.ensure_profile_row(_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _phone text;
  _name text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid) THEN RETURN; END IF;

  SELECT u.email,
         COALESCE(u.phone, u.raw_user_meta_data->>'phone'),
         NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')
    INTO _email, _phone, _name
  FROM auth.users u
  WHERE u.id = _uid;

  INSERT INTO public.profiles (id, email, phone, full_name)
  VALUES (_uid, NULLIF(_email, ''), NULLIF(_phone, ''), _name)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile_row(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_as_broker(_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _has_any boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  PERFORM public.ensure_profile_row(_uid);

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid) INTO _has_any;

  IF NOT _has_any THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'agent'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _display_name IS NOT NULL AND btrim(_display_name) <> '' THEN
    UPDATE public.profiles
       SET full_name = COALESCE(NULLIF(btrim(full_name), ''), btrim(_display_name))
     WHERE id = _uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', 'agent', 'granted', NOT _has_any);
END;
$$;

REVOKE ALL ON FUNCTION public.register_as_broker(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_broker(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_as_affiliate(_display_name text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead_id uuid;
  _warn text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.ensure_profile_row(_uid);

  IF _phone IS NOT NULL AND btrim(_phone) <> '' THEN
    UPDATE public.profiles
       SET phone = COALESCE(NULLIF(btrim(phone), ''), btrim(_phone))
     WHERE id = _uid;
  END IF;
  IF _display_name IS NOT NULL AND btrim(_display_name) <> '' THEN
    UPDATE public.profiles
       SET full_name = COALESCE(NULLIF(btrim(full_name), ''), btrim(_display_name))
     WHERE id = _uid;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'affiliate'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.affiliate_profiles (user_id, display_name, phone)
  VALUES (_uid, _display_name, _phone)
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, affiliate_profiles.display_name),
        phone = COALESCE(EXCLUDED.phone, affiliate_profiles.phone),
        updated_at = now();

  BEGIN
    _lead_id := public.ensure_affiliate_onboarding_access(_uid);
  EXCEPTION WHEN OTHERS THEN
    _warn := SQLERRM;
    _lead_id := NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'onboarding_lead_id', _lead_id, 'warning', _warn);
END;
$$;

REVOKE ALL ON FUNCTION public.register_as_affiliate(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_affiliate(text, text) TO authenticated;