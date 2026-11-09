-- Messages / chat history: only for leads in a workspace the caller can access.
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY messages_insert_by_lead_workspace ON public.messages FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND public.can_access_lead_in_current_workspace(l.id, l.assigned_to)));

DROP POLICY IF EXISTS "Authenticated users can insert chat_history" ON public.chat_history;
CREATE POLICY chat_history_insert_by_lead_workspace ON public.chat_history FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = chat_history.lead_id AND public.can_access_lead_in_current_workspace(l.id, l.assigned_to)));

-- Logs written by the signed-in user must carry their own identity.
DROP POLICY IF EXISTS "Authenticated users can insert ai_content_logs" ON public.ai_content_logs;
CREATE POLICY ai_content_logs_insert_own ON public.ai_content_logs FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated insert usage_events" ON public.usage_events;
CREATE POLICY usage_events_insert_own ON public.usage_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.ws_current_access(user_id));

DROP POLICY IF EXISTS "Authenticated users can insert audit_logs" ON public.audit_logs;
CREATE POLICY audit_logs_insert_own ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can insert error_logs" ON public.error_logs;
CREATE POLICY error_logs_insert_own ON public.error_logs FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create tracking links" ON public.tracking_links;
CREATE POLICY tracking_links_insert_admin ON public.tracking_links FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_above(auth.uid()));

-- Research logs: each user sees and changes only their own (Super Admin sees all).
DROP POLICY IF EXISTS "Agent can manage research logs" ON public.market_research_logs;
CREATE POLICY market_research_logs_own ON public.market_research_logs FOR ALL TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));