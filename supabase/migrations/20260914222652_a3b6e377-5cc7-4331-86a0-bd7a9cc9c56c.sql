CREATE POLICY "Workspace members can read demo requests"
ON public.demo_requests FOR SELECT TO authenticated
USING (public.can_access_workspace_owner(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)));

CREATE POLICY "Workspace members can update demo requests"
ON public.demo_requests FOR UPDATE TO authenticated
USING (public.can_access_workspace_owner(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)));