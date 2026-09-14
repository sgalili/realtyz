CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

INSERT INTO public.profiles (id, email, phone, full_name)
SELECT u.id,
       NULLIF(u.email, ''),
       NULLIF(COALESCE(u.phone, u.raw_user_meta_data->>'phone'), ''),
       NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')
FROM auth.users u
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.affiliate_profiles (user_id, display_name, phone)
SELECT ur.user_id, p.full_name, p.phone
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'affiliate'::public.app_role
ON CONFLICT (user_id) DO NOTHING;

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
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'profile_user_id_required';
  END IF;

  SELECT u.email,
         COALESCE(u.phone, u.raw_user_meta_data->>'phone'),
         NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')
    INTO _email, _phone, _name
  FROM auth.users u
  WHERE u.id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'authenticated_user_not_found';
  END IF;

  INSERT INTO public.profiles (id, email, phone, full_name)
  VALUES (_uid, NULLIF(_email, ''), NULLIF(_phone, ''), _name)
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(NULLIF(public.profiles.email, ''), EXCLUDED.email),
      phone = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone),
      full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name);
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
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.ensure_profile_row(_uid);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'agent'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _display_name IS NOT NULL AND btrim(_display_name) <> '' THEN
    UPDATE public.profiles
       SET full_name = COALESCE(NULLIF(btrim(full_name), ''), btrim(_display_name))
     WHERE id = _uid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _uid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'agent'::public.app_role
  ) THEN
    RAISE EXCEPTION 'broker_registration_incomplete';
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'role', 'agent');
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
  _profile_name text;
  _profile_phone text;
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

  SELECT full_name, phone
    INTO _profile_name, _profile_phone
  FROM public.profiles
  WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'affiliate'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.affiliate_profiles (user_id, display_name, phone)
  VALUES (
    _uid,
    COALESCE(NULLIF(btrim(_display_name), ''), _profile_name),
    COALESCE(NULLIF(btrim(_phone), ''), _profile_phone)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.affiliate_profiles.display_name),
        phone = COALESCE(EXCLUDED.phone, public.affiliate_profiles.phone),
        updated_at = now();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _uid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'affiliate'::public.app_role
  ) OR NOT EXISTS (
    SELECT 1 FROM public.affiliate_profiles WHERE user_id = _uid
  ) THEN
    RAISE EXCEPTION 'affiliate_registration_incomplete';
  END IF;

  BEGIN
    _lead_id := public.ensure_affiliate_onboarding_access(_uid);
  EXCEPTION WHEN OTHERS THEN
    _warn := SQLERRM;
    _lead_id := NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', _uid,
    'role', 'affiliate',
    'onboarding_lead_id', _lead_id,
    'warning', _warn
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_as_affiliate(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_affiliate(text, text) TO authenticated;