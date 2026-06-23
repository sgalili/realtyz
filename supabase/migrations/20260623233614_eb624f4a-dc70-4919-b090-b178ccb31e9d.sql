
CREATE POLICY messages_delete_by_lead_workspace
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    is_admin_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = messages.lead_id
        AND (l.assigned_to = auth.uid() OR shares_workspace_with(l.assigned_to, auth.uid()))
    )
  );

CREATE POLICY chat_history_delete_by_lead_workspace
  ON public.chat_history FOR DELETE
  TO authenticated
  USING (
    is_admin_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = chat_history.lead_id
        AND (l.assigned_to = auth.uid() OR shares_workspace_with(l.assigned_to, auth.uid()))
    )
  );
