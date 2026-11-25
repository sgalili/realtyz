-- ws_current_access(x) == (x = current_workspace_owner()) AND ws_current_access(current_workspace_owner()); the second part is row-independent.
ALTER POLICY activity_log_workspace ON public.interaction_activity_log
  USING (workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner())))
  WITH CHECK (workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner())));
ALTER POLICY superadmin_tenant_full_access ON public.interaction_activity_log
  USING ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role)) AND workspace_owner_id = (SELECT public.current_workspace_owner()))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role)) AND workspace_owner_id = (SELECT public.current_workspace_owner()));

ALTER POLICY leads_select_workspace ON public.leads
  USING (((NOT is_demo) OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
    AND workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner()))
    AND ((NOT (SELECT public.is_junior_agent((SELECT auth.uid())))) OR assigned_to = (SELECT auth.uid())));
ALTER POLICY leads_update_workspace ON public.leads
  USING (workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner()))
    AND ((NOT (SELECT public.is_junior_agent((SELECT auth.uid())))) OR assigned_to = (SELECT auth.uid())))
  WITH CHECK (workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner()))
    AND ((NOT (SELECT public.is_junior_agent((SELECT auth.uid())))) OR assigned_to = (SELECT auth.uid())));
ALTER POLICY leads_insert_workspace ON public.leads
  WITH CHECK (workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner())));
ALTER POLICY leads_delete_workspace ON public.leads
  USING (workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner()))
    AND (SELECT public.can_delete_leads((SELECT auth.uid()))));
ALTER POLICY superadmin_tenant_full_access ON public.leads
  USING ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role)) AND workspace_owner_id = (SELECT public.current_workspace_owner()))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role)) AND workspace_owner_id = (SELECT public.current_workspace_owner()));

-- Fast path first (implies the function result); the function still covers affiliate access.
ALTER POLICY chat_history_select_by_lead_workspace ON public.chat_history
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = chat_history.lead_id AND (
    (l.workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner())))
    OR public.can_access_lead_in_current_workspace(l.id, l.assigned_to))));
ALTER POLICY chat_history_insert_by_lead_workspace ON public.chat_history
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = chat_history.lead_id AND (
    (l.workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner())))
    OR public.can_access_lead_in_current_workspace(l.id, l.assigned_to))));
ALTER POLICY chat_history_delete_by_lead_workspace ON public.chat_history
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = chat_history.lead_id AND (
    (l.workspace_owner_id = (SELECT public.current_workspace_owner()) AND (SELECT public.ws_current_access(public.current_workspace_owner())))
    OR public.can_access_lead_in_current_workspace(l.id, l.assigned_to))));