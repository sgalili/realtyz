ALTER TABLE public.admin_broker_onboarding ADD COLUMN invited_at timestamptz, ADD COLUMN invitation_message_id text;
CREATE TABLE public.broker_invitation_sends (request_id uuid PRIMARY KEY, broker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, created_by uuid NOT NULL, template_name text NOT NULL, status text NOT NULL DEFAULT 'sending', message_id text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.broker_invitation_sends TO authenticated;
GRANT ALL ON public.broker_invitation_sends TO service_role;
ALTER TABLE public.broker_invitation_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_invitation_sends_admin_read ON public.broker_invitation_sends FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE FUNCTION public.broker_onboarding_status(_broker uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.admin_broker_onboarding; pending integer; published integer;
BEGIN
 IF auth.uid() IS NULL OR (auth.uid()<>_broker AND NOT public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO o FROM public.admin_broker_onboarding WHERE user_id=_broker;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*) FILTER (WHERE NOT coalesce(is_public,false)), count(*) FILTER (WHERE coalesce(is_public,false)) INTO pending,published FROM public.listings WHERE workspace_owner_id=_broker AND status NOT IN ('removed','sold','discarded') AND coalesce((features->>'canonical_duplicate_of'),'')='';
 RETURN jsonb_build_object('stage', CASE WHEN o.first_login_at IS NULL AND o.invited_at IS NULL THEN 'not_invited' WHEN o.first_login_at IS NULL THEN 'pending_otp' WHEN pending>0 THEN 'pending_property_review' WHEN published>0 THEN 'published' ELSE 'pending_inventory' END,'invited_at',o.invited_at,'first_login_at',o.first_login_at,'pending_properties',pending,'published_properties',published);
END $$;
REVOKE ALL ON FUNCTION public.broker_onboarding_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.broker_onboarding_status(uuid) TO authenticated;