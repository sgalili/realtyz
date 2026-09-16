DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Workspace members view workspace notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (public.can_access_workspace_owner(user_id));

DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY "Workspace members insert workspace notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_workspace_owner(user_id));