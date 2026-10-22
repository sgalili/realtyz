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
  IF NOT EXISTS (SELECT 1 FROM public.deleted_accounts_archive WHERE user_id=_uid AND reason IN ('self_request','self_request_pending')) THEN
    INSERT INTO public.deleted_accounts_archive(user_id,phone,email,full_name,roles,profile,reason)
    VALUES (_uid,_phone,_email,p.full_name,role_list,NULL,'self_request_pending');
  END IF;
  n := public.admin_purge_user_data(_uid);
  RETURN jsonb_build_object('ok',true,'purged',n);
END $$;
REVOKE ALL ON FUNCTION public.prepare_account_self_deletion(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_self_deletion(uuid,text,text,text) TO service_role;