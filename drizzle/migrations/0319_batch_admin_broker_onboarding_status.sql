CREATE OR REPLACE FUNCTION public.admin_broker_onboarding_statuses() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 WITH counts AS (SELECT l.workspace_owner_id,count(*) FILTER(WHERE NOT(coalesce(l.is_published,false) OR coalesce(l.affiliate_enabled,false))) AS pending,count(*) FILTER(WHERE coalesce(l.is_published,false) OR coalesce(l.affiliate_enabled,false)) AS published FROM public.listings l JOIN public.admin_broker_onboarding o ON o.user_id=l.workspace_owner_id WHERE coalesce(l.status,'') NOT IN ('removed','sold','discarded','deleted','closed','archived','off_market','נמכר','הוסר') AND l.canonical_duplicate_of IS NULL GROUP BY l.workspace_owner_id)
 SELECT coalesce(jsonb_object_agg(o.user_id,jsonb_build_object('stage',CASE WHEN o.first_login_at IS NULL AND o.invited_at IS NULL THEN 'not_invited' WHEN o.first_login_at IS NULL THEN 'pending_otp' WHEN coalesce(c.pending,0)>0 THEN 'pending_property_review' WHEN coalesce(c.published,0)>0 THEN 'published' ELSE 'pending_inventory' END,'invited_at',o.invited_at,'first_login_at',o.first_login_at,'pending_properties',coalesce(c.pending,0),'published_properties',coalesce(c.published,0))),'{}'::jsonb) INTO result FROM public.admin_broker_onboarding o LEFT JOIN counts c ON c.workspace_owner_id=o.user_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_broker_onboarding_statuses() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_broker_onboarding_statuses() TO authenticated,service_role;