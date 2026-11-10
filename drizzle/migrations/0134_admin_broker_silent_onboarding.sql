CREATE TABLE public.admin_broker_onboarding (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 first_login_at timestamptz
);
GRANT SELECT ON public.admin_broker_onboarding TO authenticated;
GRANT ALL ON public.admin_broker_onboarding TO service_role;
ALTER TABLE public.admin_broker_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_broker_onboarding_read ON public.admin_broker_onboarding FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE FUNCTION public.admin_onboarding_recipient_silent(_phone text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_broker_onboarding o JOIN public.profiles p ON p.id=o.user_id WHERE o.first_login_at IS NULL AND regexp_replace(p.phone,'\D','','g') IN (regexp_replace(_phone,'\D','','g'), '0'||right(regexp_replace(_phone,'\D','','g'),9), '972'||right(regexp_replace(_phone,'\D','','g'),9)));
$$;
REVOKE ALL ON FUNCTION public.admin_onboarding_recipient_silent(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_onboarding_recipient_silent(text) TO service_role;
CREATE FUNCTION public.complete_admin_broker_first_login() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _pending boolean;
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT first_login_at IS NULL INTO _pending FROM public.admin_broker_onboarding WHERE user_id=_uid FOR UPDATE;
 IF NOT coalesce(_pending,false) THEN RETURN '/'; END IF;
 IF NOT public.partner_can_view_closing(_uid) THEN RETURN '/'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_memberships WHERE user_id=_uid AND workspace_owner_id=_uid) THEN RAISE EXCEPTION 'workspace_forbidden'; END IF;
 PERFORM public.set_active_workspace(_uid);
 UPDATE public.admin_broker_onboarding SET first_login_at=now() WHERE user_id=_uid;
 RETURN '/properties';
END $$;
REVOKE ALL ON FUNCTION public.complete_admin_broker_first_login() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_admin_broker_first_login() TO authenticated;
COMMENT ON TABLE public.admin_broker_onboarding IS 'Service-created onboarding state; silence until authenticated broker first entry. Invitation links are not credentials.';