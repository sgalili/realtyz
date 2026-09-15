GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_sms_settings TO authenticated;
GRANT ALL ON public.workspace_sms_settings TO service_role;

DROP POLICY IF EXISTS "Owners manage their workspace SMS settings" ON public.workspace_sms_settings;

CREATE POLICY "ws sms settings select"
  ON public.workspace_sms_settings FOR SELECT TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.ws_current_access(workspace_owner_id));

CREATE POLICY "ws sms settings insert"
  ON public.workspace_sms_settings FOR INSERT TO authenticated
  WITH CHECK (workspace_owner_id = auth.uid() OR public.ws_current_access(workspace_owner_id));

CREATE POLICY "ws sms settings update"
  ON public.workspace_sms_settings FOR UPDATE TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.ws_current_access(workspace_owner_id))
  WITH CHECK (workspace_owner_id = auth.uid() OR public.ws_current_access(workspace_owner_id));

CREATE POLICY "ws sms settings delete"
  ON public.workspace_sms_settings FOR DELETE TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.ws_current_access(workspace_owner_id));