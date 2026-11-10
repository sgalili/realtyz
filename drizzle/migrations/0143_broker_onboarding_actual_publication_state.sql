CREATE OR REPLACE FUNCTION public.broker_onboarding_status(_broker uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.admin_broker_onboarding; pending integer; published integer;
BEGIN
 IF auth.uid() IS NULL OR (auth.uid()<>_broker AND NOT public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO o FROM public.admin_broker_onboarding WHERE user_id=_broker;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*) FILTER (WHERE NOT (coalesce(is_published,false) OR coalesce(affiliate_enabled,false))), count(*) FILTER (WHERE coalesce(is_published,false) OR coalesce(affiliate_enabled,false)) INTO pending,published FROM public.listings WHERE workspace_owner_id=_broker AND coalesce(status,'') NOT IN ('removed','sold','discarded','deleted','closed','archived','off_market','נמכר','הוסר') AND canonical_duplicate_of IS NULL;
 RETURN jsonb_build_object('stage', CASE WHEN o.first_login_at IS NULL AND o.invited_at IS NULL THEN 'not_invited' WHEN o.first_login_at IS NULL THEN 'pending_otp' WHEN pending>0 THEN 'pending_property_review' WHEN published>0 THEN 'published' ELSE 'pending_inventory' END,'invited_at',o.invited_at,'first_login_at',o.first_login_at,'pending_properties',pending,'published_properties',published);
END $$;
REVOKE ALL ON FUNCTION public.broker_onboarding_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.broker_onboarding_status(uuid) TO authenticated;