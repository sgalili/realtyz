ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS demo_requests_lead_id_idx ON public.demo_requests(lead_id);
CREATE INDEX IF NOT EXISTS contact_submissions_lead_id_idx ON public.contact_submissions(lead_id);
CREATE INDEX IF NOT EXISTS leads_assigned_phone_idx ON public.leads(assigned_to, phone_number);

CREATE OR REPLACE FUNCTION public.ensure_rita_crm_contact(
  _full_name text,
  _phone text,
  _email text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _origin text DEFAULT 'registration',
  _source_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rita constant uuid := 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';
  _digits text;
  _lead_id uuid;
  _name text := NULLIF(btrim(COALESCE(_full_name, '')), '');
  _clean_email text := NULLIF(btrim(COALESCE(_email, '')), '');
  _clean_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
BEGIN
  _digits := regexp_replace(COALESCE(_phone, ''), '\D', '', 'g');
  IF left(_digits, 4) = '00972' THEN _digits := substr(_digits, 3); END IF;
  IF left(_digits, 1) = '0' THEN _digits := '972' || substr(_digits, 2); END IF;
  IF left(_digits, 3) <> '972' AND length(_digits) BETWEEN 8 AND 10 THEN
    _digits := '972' || _digits;
  END IF;
  IF _digits !~ '^972[2-9][0-9]{7,8}$' THEN
    RAISE EXCEPTION 'contact_phone_invalid';
  END IF;

  SELECT id INTO _lead_id
  FROM public.leads
  WHERE assigned_to = _rita AND phone_number = _digits
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF _lead_id IS NULL THEN
    INSERT INTO public.leads (
      full_name, phone_number, email, notes, assigned_to,
      lead_stage, deal_type, interest_tag, preferences
    ) VALUES (
      COALESCE(_name, _digits), _digits, _clean_email, _clean_notes, _rita,
      'broker_new', 'sale',
      CASE WHEN _origin = 'demo_requests' THEN 'דמו מהאתר'
           WHEN _origin = 'contact_submissions' THEN 'פנייה מהאתר'
           ELSE 'הרשמה לאפליקציה' END,
      jsonb_strip_nulls(jsonb_build_object(
        'lead_kind', 'broker',
        'origin', _origin,
        'source', 'landing',
        'registered_user_id', _source_user_id
      ))
    )
    RETURNING id INTO _lead_id;
  ELSE
    UPDATE public.leads
    SET full_name = COALESCE(NULLIF(public.leads.full_name, ''), _name),
        email = COALESCE(NULLIF(public.leads.email, ''), _clean_email),
        notes = CASE
          WHEN NULLIF(public.leads.notes, '') IS NULL THEN _clean_notes
          WHEN _clean_notes IS NULL OR position(_clean_notes in public.leads.notes) > 0 THEN public.leads.notes
          ELSE public.leads.notes || E'\n' || _clean_notes
        END,
        preferences = COALESCE(public.leads.preferences, '{}'::jsonb) ||
          jsonb_strip_nulls(jsonb_build_object('lead_kind', 'broker', 'registered_user_id', _source_user_id))
    WHERE id = _lead_id;
  END IF;

  RETURN _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_rita_crm_contact(text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_rita_crm_contact(text, text, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.route_landing_lead_to_rita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _phone text;
  _email text;
  _notes text;
BEGIN
  IF TG_TABLE_NAME = 'demo_requests' THEN
    _name := btrim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
    _phone := NEW.phone;
    _email := NULL;
    _notes := concat_ws(' | ', NULLIF(NEW.notes, ''), 'תיאום הדגמה: ' || NEW.preferred_at::text);
  ELSE
    _name := NEW.full_name;
    _phone := NEW.phone_number;
    _email := NEW.email;
    _notes := NEW.message;
  END IF;

  NEW.lead_id := public.ensure_rita_crm_contact(_name, _phone, _email, _notes, TG_TABLE_NAME, NULL);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'route_landing_lead_to_rita failed table=% phone=% error=%', TG_TABLE_NAME, _phone, SQLERRM;
  RAISE;
END;
$$;

DROP TRIGGER IF EXISTS demo_requests_route_to_rita ON public.demo_requests;
DROP TRIGGER IF EXISTS contact_submissions_route_to_rita ON public.contact_submissions;
DROP TRIGGER IF EXISTS trg_demo_requests_route_to_rita ON public.demo_requests;
DROP TRIGGER IF EXISTS trg_contact_submissions_route_to_rita ON public.contact_submissions;

CREATE TRIGGER demo_requests_route_to_rita
BEFORE INSERT OR UPDATE OF first_name, last_name, phone, notes, preferred_at
ON public.demo_requests
FOR EACH ROW EXECUTE FUNCTION public.route_landing_lead_to_rita();

CREATE TRIGGER contact_submissions_route_to_rita
BEFORE INSERT OR UPDATE OF full_name, phone_number, email, message
ON public.contact_submissions
FOR EACH ROW EXECUTE FUNCTION public.route_landing_lead_to_rita();

UPDATE public.demo_requests d
SET lead_id = public.ensure_rita_crm_contact(
  btrim(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')),
  d.phone,
  NULL,
  concat_ws(' | ', NULLIF(d.notes, ''), 'תיאום הדגמה: ' || d.preferred_at::text),
  'demo_requests',
  NULL
)
WHERE d.lead_id IS NULL AND NULLIF(regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g'), '') IS NOT NULL;

UPDATE public.contact_submissions c
SET lead_id = public.ensure_rita_crm_contact(
  c.full_name, c.phone_number, c.email, c.message, 'contact_submissions', NULL
)
WHERE c.lead_id IS NULL AND NULLIF(regexp_replace(COALESCE(c.phone_number, ''), '\D', '', 'g'), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.register_as_broker(_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _profile_name text;
  _profile_phone text;
  _profile_email text;
  _lead_id uuid;
  _warn text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.ensure_profile_row(_uid);
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'agent'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  IF _display_name IS NOT NULL AND btrim(_display_name) <> '' THEN
    UPDATE public.profiles SET full_name = COALESCE(NULLIF(btrim(full_name), ''), btrim(_display_name)) WHERE id = _uid;
  END IF;
  SELECT full_name, phone, email INTO _profile_name, _profile_phone, _profile_email FROM public.profiles WHERE id = _uid;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid)
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'agent'::public.app_role) THEN
    RAISE EXCEPTION 'broker_registration_incomplete';
  END IF;
  IF NULLIF(regexp_replace(COALESCE(_profile_phone, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    BEGIN
      _lead_id := public.ensure_rita_crm_contact(_profile_name, _profile_phone, _profile_email, 'הרשמת מתווך לאפליקציה', 'app_registration', _uid);
    EXCEPTION WHEN OTHERS THEN
      _warn := SQLERRM;
      RAISE LOG 'broker CRM contact provisioning failed user=% error=%', _uid, SQLERRM;
    END;
  ELSE
    _warn := 'registration_phone_missing';
  END IF;
  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'role', 'agent', 'lead_id', _lead_id, 'warning', _warn);
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
  _profile_email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.ensure_profile_row(_uid);
  IF _phone IS NOT NULL AND btrim(_phone) <> '' THEN
    UPDATE public.profiles SET phone = COALESCE(NULLIF(btrim(phone), ''), btrim(_phone)) WHERE id = _uid;
  END IF;
  IF _display_name IS NOT NULL AND btrim(_display_name) <> '' THEN
    UPDATE public.profiles SET full_name = COALESCE(NULLIF(btrim(full_name), ''), btrim(_display_name)) WHERE id = _uid;
  END IF;
  SELECT full_name, phone, email INTO _profile_name, _profile_phone, _profile_email FROM public.profiles WHERE id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'affiliate'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.affiliate_profiles (user_id, display_name, phone)
  VALUES (_uid, COALESCE(NULLIF(btrim(_display_name), ''), _profile_name), COALESCE(NULLIF(btrim(_phone), ''), _profile_phone))
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, public.affiliate_profiles.display_name),
    phone = COALESCE(EXCLUDED.phone, public.affiliate_profiles.phone), updated_at = now();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid)
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'affiliate'::public.app_role)
     OR NOT EXISTS (SELECT 1 FROM public.affiliate_profiles WHERE user_id = _uid) THEN
    RAISE EXCEPTION 'affiliate_registration_incomplete';
  END IF;
  IF NULLIF(regexp_replace(COALESCE(_profile_phone, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    BEGIN
      _lead_id := public.ensure_rita_crm_contact(_profile_name, _profile_phone, _profile_email, 'הרשמת שותף לאפליקציה', 'app_registration', _uid);
    EXCEPTION WHEN OTHERS THEN
      _warn := SQLERRM;
      RAISE LOG 'affiliate CRM contact provisioning failed user=% error=%', _uid, SQLERRM;
    END;
  ELSE
    _warn := 'registration_phone_missing';
  END IF;
  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'role', 'affiliate', 'lead_id', _lead_id, 'warning', _warn);
END;
$$;
REVOKE ALL ON FUNCTION public.register_as_affiliate(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_affiliate(text, text) TO authenticated;