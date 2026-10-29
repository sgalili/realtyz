CREATE OR REPLACE FUNCTION public.remove_my_broker_license()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _removed integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text,0));
  UPDATE public.profiles SET broker_license_number = NULL WHERE id = _uid;
  DELETE FROM public.broker_license_verifications WHERE user_id = _uid;
  DELETE FROM public.broker_role_suspensions WHERE user_id = _uid;
  DELETE FROM public.user_roles WHERE user_id = _uid AND role IN ('agent','lead_agent','managing_broker','junior_agent');
  GET DIAGNOSTICS _removed = ROW_COUNT;
  INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'user') ON CONFLICT (user_id, role) DO NOTHING;
  BEGIN
    INSERT INTO public.audit_logs(user_id, action, details) VALUES (_uid, 'broker_license_removed', jsonb_build_object('roles_removed', _removed));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('ok', true, 'roles_removed', _removed);
END $$;
REVOKE ALL ON FUNCTION public.remove_my_broker_license() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_my_broker_license() TO authenticated;