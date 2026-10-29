CREATE OR REPLACE FUNCTION public.broker_name_tokens(_n text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(t ORDER BY t), '{}') FROM unnest(regexp_split_to_array(btrim(regexp_replace(lower(coalesce(_n,'')), '[^[:alnum:][:space:]]', ' ', 'g')), '\s+')) t WHERE t <> ''
$$;

CREATE OR REPLACE FUNCTION public.notify_broker_upgrade(_uid uuid, _id uuid, _status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _title text; _body text; _admin_body text; _name text;
BEGIN
  SELECT full_name INTO _name FROM public.profiles WHERE id = _uid;
  IF _status = 'approved' THEN _title := 'החשבון שודרג למתווך מורשה'; _body := 'רישיון התיווך אומת והחשבון שודרג למתווך מורשה.';
  ELSIF _status = 'rejected' THEN _title := 'בקשת השדרוג למתווך נדחתה'; _body := 'לא ניתן היה לאשר את רישיון התיווך. ניתן להגיש מחדש.';
  ELSE _title := 'בקשת השדרוג למתווך בבדיקה'; _body := 'הבקשה התקבלה ונמצאת בבדיקה. נעדכן אותך בהמשך.'; END IF;
  INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel) VALUES (_uid, 'broker_upgrade_' || _status, _title, _body, '/profile', 'in_app');
  _admin_body := coalesce(_name, 'משתמש') || ': ' || CASE _status WHEN 'approved' THEN 'אושר אוטומטית כמתווך מורשה' WHEN 'rejected' THEN 'בקשת השדרוג נדחתה' ELSE 'ממתין לאישורך (השם אינו תואם לרישום)' END;
  INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel)
    SELECT ur.user_id, 'broker_upgrade_admin_' || _status, 'סטטוס אימות רישיון תיווך', _admin_body, '/super-admin', 'in_app'
    FROM public.user_roles ur WHERE ur.role = 'super_admin' AND ur.user_id <> _uid;
END $$;
REVOKE ALL ON FUNCTION public.notify_broker_upgrade(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_broker_upgrade_request() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _v record; _c record; _id uuid; _name text; _auto boolean; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT license_number, registry_holder_name INTO _v FROM public.broker_license_verifications WHERE user_id = _uid;
  IF _v.license_number IS NULL THEN RAISE EXCEPTION 'registry_verification_required'; END IF;
  IF NOT public.official_license_exists(_v.license_number) THEN RAISE EXCEPTION 'invalid_official_license'; END IF;
  SELECT id, certificate_name INTO _c FROM public.broker_certificate_checks
    WHERE user_id = _uid AND status = 'matched' AND license_number = _v.license_number ORDER BY created_at DESC LIMIT 1;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'certificate_match_required'; END IF;
  SELECT full_name INTO _name FROM public.profiles WHERE id = _uid;
  _auto := cardinality(public.broker_name_tokens(_name)) >= 2 AND _v.registry_holder_name IS NOT NULL
    AND public.broker_name_tokens(_name) = public.broker_name_tokens(_v.registry_holder_name);
  _status := CASE WHEN _auto THEN 'approved' ELSE 'pending' END;
  SELECT id INTO _id FROM public.broker_upgrade_requests WHERE user_id = _uid AND status = 'pending';
  IF _id IS NULL THEN
    INSERT INTO public.broker_upgrade_requests(user_id, license_number, registry_holder_name, certificate_name, certificate_check_id, status, reviewed_at, review_note)
      VALUES (_uid, _v.license_number, _v.registry_holder_name, _c.certificate_name, _c.id, _status, CASE WHEN _auto THEN now() END, CASE WHEN _auto THEN 'auto_approved_name_match' END) RETURNING id INTO _id;
  ELSE
    UPDATE public.broker_upgrade_requests SET license_number = _v.license_number, registry_holder_name = _v.registry_holder_name,
      certificate_name = _c.certificate_name, certificate_check_id = _c.id, created_at = now(), status = _status,
      reviewed_at = CASE WHEN _auto THEN now() END, review_note = CASE WHEN _auto THEN 'auto_approved_name_match' END WHERE id = _id;
  END IF;
  IF _auto THEN
    UPDATE public.profiles SET broker_license_number = _v.license_number WHERE id = _uid;
    INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.broker_role_suspensions WHERE user_id = _uid;
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
    VALUES (_uid, CASE WHEN _auto THEN 'broker_upgrade_auto_approved' ELSE 'broker_upgrade_requested' END, 'broker_upgrade_requests', _id::text, jsonb_build_object('license_number', _v.license_number, 'status', _status));
  PERFORM public.notify_broker_upgrade(_uid, _id, _status);
  RETURN jsonb_build_object('ok', true, 'status', _status, 'id', _id);
END $$;

CREATE OR REPLACE FUNCTION public.review_broker_upgrade_request(_id uuid, _approve boolean, _note text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  PERFORM public.notify_broker_upgrade(_r.user_id, _id, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END);
  RETURN jsonb_build_object('ok', true);
END $$;