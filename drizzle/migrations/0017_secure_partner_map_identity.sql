-- Only the authenticated edge function may supply the user identity for this service RPC.
REVOKE ALL ON FUNCTION public.get_affiliate_marketplace_map(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace_map(uuid) TO service_role;
CREATE POLICY closing_split_role_isolation ON public.lead_closing_splits AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR (NOT public.has_role(auth.uid(),'developer') AND (public.partner_can_view_closing(auth.uid()) OR (public.can_close_deal(auth.uid()) AND public.ws_current_access(workspace_owner_id)))));