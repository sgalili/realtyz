CREATE FUNCTION public.finalize_admin_broker_setup(_user_id uuid, _license text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _request uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _license !~ '^[1-9][0-9]{3,9}$' THEN RAISE EXCEPTION 'invalid_license_format'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user_id AND created_by=auth.uid() AND first_login_at IS NULL) THEN RAISE EXCEPTION 'not_admin_created_pending_broker'; END IF;
 INSERT INTO public.broker_upgrade_requests(user_id,license_number,status,review_note) VALUES (_user_id,_license,'pending','admin_silent_onboarding') RETURNING id INTO _request;
 PERFORM public.review_broker_upgrade_request(_request,true,'Explicit Super Admin approval during silent onboarding');
 INSERT INTO public.user_roles(user_id,role) VALUES (_user_id,'managing_broker') ON CONFLICT(user_id,role) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.finalize_admin_broker_setup(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_admin_broker_setup(uuid,text) TO authenticated;