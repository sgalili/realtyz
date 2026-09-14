CREATE OR REPLACE FUNCTION public.ensure_affiliate_onboarding_access(_affiliate_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _rita_owner uuid;
  _lead_id uuid;
  _name text;
  _email text;
  _profile_phone text;
  _affiliate_phone text;
  _phone text;
BEGIN
  PERFORM public.ensure_profile_row(_affiliate_user_id);

  SELECT p.id INTO _rita_owner
  FROM public.profiles p
  WHERE regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') IN ('0537983832', '972537983832')
     OR lower(COALESCE(p.full_name, '')) = 'rita'
     OR p.full_name = 'ריטה'
  ORDER BY CASE WHEN regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') IN ('0537983832', '972537983832') THEN 0 ELSE 1 END
  LIMIT 1;

  IF _rita_owner IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.full_name, p.email, p.phone, ap.phone
    INTO _name, _email, _profile_phone, _affiliate_phone
  FROM public.profiles p
  LEFT JOIN public.affiliate_profiles ap ON ap.user_id = p.id
  WHERE p.id = _affiliate_user_id;

  _phone := regexp_replace(COALESCE(NULLIF(_affiliate_phone, ''), NULLIF(_profile_phone, ''), ''), '\D', '', 'g');
  IF _phone LIKE '05%' THEN
    _phone := '972' || substring(_phone FROM 2);
  END IF;
  IF _phone = '' THEN
    _phone := 'affiliate:' || _affiliate_user_id::text;
  END IF;

  SELECT aca.lead_id INTO _lead_id
  FROM public.affiliate_conversation_access aca
  WHERE aca.affiliate_user_id = _affiliate_user_id
  ORDER BY aca.created_at
  LIMIT 1;

  IF _lead_id IS NULL THEN
    SELECT l.id INTO _lead_id
    FROM public.leads l
    WHERE l.assigned_to = _rita_owner
      AND l.phone_number = _phone
    LIMIT 1;
  END IF;

  IF _lead_id IS NULL THEN
    INSERT INTO public.leads (
      phone_number, full_name, email, assigned_to, lead_stage, status,
      ai_autopilot, deal_type, preferences, is_demo
    ) VALUES (
      _phone,
      COALESCE(NULLIF(_name, ''), NULLIF(_email, ''), 'שותף חדש'),
      NULLIF(_email, ''),
      _rita_owner,
      'new_lead',
      'new',
      true,
      'sale',
      jsonb_build_object(
        'lead_kind', 'broker',
        'source', 'affiliate_signup',
        'affiliate_user_id', _affiliate_user_id,
        'rita_onboarding', true
      ),
      false
    ) RETURNING id INTO _lead_id;
  ELSE
    UPDATE public.leads
    SET full_name = COALESCE(NULLIF(_name, ''), full_name),
        email = COALESCE(NULLIF(_email, ''), email)
    WHERE id = _lead_id;
  END IF;

  INSERT INTO public.affiliate_conversation_access (
    affiliate_user_id, lead_id, workspace_owner_id, access_reason
  ) VALUES (
    _affiliate_user_id, _lead_id, _rita_owner, 'rita_onboarding'
  )
  ON CONFLICT (affiliate_user_id, workspace_owner_id)
  DO UPDATE SET lead_id = EXCLUDED.lead_id, updated_at = now();

  RETURN _lead_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_affiliate_onboarding_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_affiliate_onboarding_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.register_referral(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer uuid;
  _lead_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_attributed');
  END IF;

  SELECT id INTO _referrer
  FROM public.profiles
  WHERE referral_code = upper(btrim(_code));

  IF _referrer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;
  IF _referrer = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referral_code, status)
  VALUES (_referrer, auth.uid(), upper(btrim(_code)), 'registered_free')
  ON CONFLICT (referred_user_id) DO NOTHING;

  IF public.is_affiliate(auth.uid()) THEN
    BEGIN
      _lead_id := public.ensure_affiliate_onboarding_access(auth.uid());
    EXCEPTION WHEN OTHERS THEN
      _lead_id := NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'referrer_id', _referrer, 'onboarding_lead_id', _lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_referral(text) TO authenticated;