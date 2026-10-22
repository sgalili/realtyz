CREATE OR REPLACE FUNCTION public.admin_purge_user_data(_uid uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE r record; total integer := 0; n integer; pass integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'uid_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin') THEN RAISE EXCEPTION 'cannot_delete_super_admin'; END IF;
  FOR pass IN 1..8 LOOP
    FOR r IN
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
      WHERE c.table_schema='public' AND c.data_type='uuid'
        AND c.column_name IN ('workspace_owner_id','user_id','owner_user_id','owner_id','created_by','broker_id','affiliate_id','referrer_id','referred_id','assigned_to')
        AND c.table_name NOT IN ('profiles','user_roles','audit_logs','deleted_accounts_archive','account_deletion_otps')
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING _uid;
        GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      EXCEPTION WHEN foreign_key_violation THEN
        IF pass = 8 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
  DELETE FROM public.user_roles WHERE user_id=_uid;
  DELETE FROM public.profiles WHERE id=_uid;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.admin_purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_user_data(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_account_self_deletion(_uid uuid, _code_hash text, _phone text, _email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE otp public.account_deletion_otps; p public.profiles; role_list text[]; n integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'uid_required'; END IF;
  SELECT * INTO otp FROM public.account_deletion_otps WHERE user_id=_uid FOR UPDATE;
  IF NOT FOUND OR otp.expires_at < now() OR otp.attempts >= 5 THEN RETURN jsonb_build_object('error','code_expired'); END IF;
  IF otp.code_hash IS DISTINCT FROM _code_hash THEN
    UPDATE public.account_deletion_otps SET attempts=attempts+1 WHERE user_id=_uid;
    RETURN jsonb_build_object('error','wrong_code');
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin') THEN RETURN jsonb_build_object('error','super_admin_cannot_self_delete'); END IF;
  SELECT * INTO p FROM public.profiles WHERE id=_uid;
  SELECT array_agg(role::text) INTO role_list FROM public.user_roles WHERE user_id=_uid;
  IF NOT EXISTS (SELECT 1 FROM public.deleted_accounts_archive WHERE user_id=_uid AND reason='self_request') THEN
    INSERT INTO public.deleted_accounts_archive(user_id,phone,email,full_name,roles,profile)
    VALUES (_uid,_phone,_email,p.full_name,role_list,NULL);
  END IF;
  n := public.admin_purge_user_data(_uid);
  RETURN jsonb_build_object('ok',true,'purged',n);
END $$;
REVOKE ALL ON FUNCTION public.prepare_account_self_deletion(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_self_deletion(uuid,text,text,text) TO service_role;