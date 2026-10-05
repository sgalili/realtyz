GRANT SELECT ON public.listing_lead_charges TO authenticated;
CREATE POLICY "Workspace members read their lead charges" ON public.listing_lead_charges
  FOR SELECT TO authenticated USING (public.can_access_workspace_owner(workspace_owner_id));