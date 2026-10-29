CREATE OR REPLACE FUNCTION public.admin_remove_broker_license(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid(); _removed integer;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(_actor, 'super_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'missing_user'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));
  UPDATE public.profiles SET broker_license_number = NULL WHERE id = _user_id;
  DELETE FROM public.broker_license_verifications WHERE user_id = _user_id;
  DELETE FROM public.broker_role_suspensions WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role IN ('agent','lead_agent','managing_broker','junior_agent');
  GET DIAGNOSTICS _removed = ROW_COUNT;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'user') ON CONFLICT (user_id, role) DO NOTHING;
  BEGIN
    INSERT INTO public.audit_logs(user_id, action, details) VALUES (_user_id, 'broker_license_removed_by_admin', jsonb_build_object('roles_removed', _removed, 'removed_by', _actor));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('ok', true, 'roles_removed', _removed);
END $$;
REVOKE ALL ON FUNCTION public.admin_remove_broker_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_broker_license(uuid) TO authenticated;