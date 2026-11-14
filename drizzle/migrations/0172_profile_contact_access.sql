CREATE OR REPLACE FUNCTION public.lead_profile_access(_lead uuid)
RETURNS TABLE(id uuid, full_name text, avatar_url text, city text, category text, can_manage boolean, phone_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,l.full_name,l.profile_picture_url,l.city,l.lead_category,
 (public.has_role(auth.uid(),'super_admin') OR (public.partner_can_view_closing(auth.uid()) AND (l.workspace_owner_id=auth.uid() OR l.assigned_to=auth.uid()))),
 CASE WHEN public.partner_can_view_closing(auth.uid()) AND (l.workspace_owner_id=auth.uid() OR l.assigned_to=auth.uid()) AND coalesce(l.lead_category,'') NOT IN ('broker','affiliate','developer','partner') THEN l.phone_number ELSE NULL END
 FROM public.leads l WHERE auth.uid() IS NOT NULL AND l.id=_lead AND public.ws_current_access(l.workspace_owner_id);
$$;
REVOKE ALL ON FUNCTION public.lead_profile_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lead_profile_access(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.profile_management_access(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=_user) AND (auth.uid()=_user OR (public.has_role(auth.uid(),'super_admin') AND public.ws_current_access(_user)));
$$;
REVOKE ALL ON FUNCTION public.profile_management_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_management_access(uuid) TO authenticated,service_role;