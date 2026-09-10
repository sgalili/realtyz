-- 1. Active-workspace helpers ------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_workspace_owner()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.active_workspace_owner_id FROM public.profiles p WHERE p.id = auth.uid()),
    auth.uid()
  );
$$;

-- True when the row's owner belongs to the workspace the caller is currently
-- viewing AND the caller is actually a member of that workspace.
CREATE OR REPLACE FUNCTION public.in_current_workspace(_row_owner uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _row_owner IS NOT NULL
     AND (
       _row_owner = public.current_workspace_owner()
       OR EXISTS (
         SELECT 1 FROM public.workspace_memberships wm
         WHERE wm.workspace_owner_id = public.current_workspace_owner()
           AND wm.user_id = _row_owner
       )
     )
     AND (
       public.current_workspace_owner() = auth.uid()
       OR EXISTS (
         SELECT 1 FROM public.workspace_memberships v
         WHERE v.user_id = auth.uid()
           AND v.workspace_owner_id = public.current_workspace_owner()
       )
       OR public.has_role(auth.uid(), 'super_admin'::app_role)
     );
$$;

-- 2. Contacts ----------------------------------------------------------------
DROP POLICY IF EXISTS "leads_select_workspace" ON public.leads;
CREATE POLICY "leads_select_workspace" ON public.leads
FOR SELECT TO authenticated
USING (
  ((NOT is_demo) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND public.in_current_workspace(assigned_to)
  AND ((NOT public.is_junior_agent(auth.uid())) OR assigned_to = auth.uid())
);

DROP POLICY IF EXISTS "leads_update_workspace" ON public.leads;
CREATE POLICY "leads_update_workspace" ON public.leads
FOR UPDATE TO authenticated
USING (
  public.in_current_workspace(assigned_to)
  AND ((NOT public.is_junior_agent(auth.uid())) OR assigned_to = auth.uid())
);

-- 3. Messages / chat history (scoped through the owning contact) -------------
DROP POLICY IF EXISTS "messages_select_by_lead_workspace" ON public.messages;
CREATE POLICY "messages_select_by_lead_workspace" ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = messages.lead_id
      AND public.in_current_workspace(l.assigned_to)
  )
);

DROP POLICY IF EXISTS "messages_delete_by_lead_workspace" ON public.messages;
CREATE POLICY "messages_delete_by_lead_workspace" ON public.messages
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = messages.lead_id
      AND public.in_current_workspace(l.assigned_to)
  )
);

DROP POLICY IF EXISTS "chat_history_select_by_lead_workspace" ON public.chat_history;
CREATE POLICY "chat_history_select_by_lead_workspace" ON public.chat_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = chat_history.lead_id
      AND public.in_current_workspace(l.assigned_to)
  )
);

DROP POLICY IF EXISTS "chat_history_delete_by_lead_workspace" ON public.chat_history;
CREATE POLICY "chat_history_delete_by_lead_workspace" ON public.chat_history
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = chat_history.lead_id
      AND public.in_current_workspace(l.assigned_to)
  )
);

-- 4. Properties --------------------------------------------------------------
DROP POLICY IF EXISTS "listings_select_workspace" ON public.listings;
CREATE POLICY "listings_select_workspace" ON public.listings
FOR SELECT TO authenticated
USING (public.in_current_workspace(user_id));

DROP POLICY IF EXISTS "listings_update_workspace" ON public.listings;
CREATE POLICY "listings_update_workspace" ON public.listings
FOR UPDATE TO authenticated
USING (public.in_current_workspace(user_id));

DROP POLICY IF EXISTS "listings_delete_workspace" ON public.listings;
CREATE POLICY "listings_delete_workspace" ON public.listings
FOR DELETE TO authenticated
USING (public.in_current_workspace(user_id));

-- 5. Campaign logs -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_campaign_log_owner(_row_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.in_current_workspace(_row_user);
$$;

-- 6. Meetings / tasks / activity --------------------------------------------
DROP POLICY IF EXISTS "Users manage own meetings" ON public.meetings;
CREATE POLICY "Users manage own meetings" ON public.meetings
FOR ALL TO authenticated
USING (public.in_current_workspace(user_id))
WITH CHECK (user_id = auth.uid() OR public.in_current_workspace(user_id));

DROP POLICY IF EXISTS "Users manage own scheduled_items" ON public.scheduled_items;
CREATE POLICY "Users manage own scheduled_items" ON public.scheduled_items
FOR ALL TO authenticated
USING (public.in_current_workspace(user_id))
WITH CHECK (user_id = auth.uid() OR public.in_current_workspace(user_id));

DROP POLICY IF EXISTS "Users manage own interaction_activity_log" ON public.interaction_activity_log;
CREATE POLICY "Users manage own interaction_activity_log" ON public.interaction_activity_log
FOR ALL TO authenticated
USING (public.in_current_workspace(user_id))
WITH CHECK (user_id = auth.uid() OR public.in_current_workspace(user_id));

-- 7. Platform-wide stats for the super-admin overview -----------------------
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'super admin required';
  END IF;
  SELECT jsonb_build_object(
    'voters', (SELECT count(*) FROM public.leads),
    'messages', (SELECT count(*) FROM public.messages),
    'campaigns', (SELECT count(*) FROM public.campaigns),
    'connections', (SELECT count(*) FROM public.social_connections WHERE is_connected = true)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_workspace_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_current_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;