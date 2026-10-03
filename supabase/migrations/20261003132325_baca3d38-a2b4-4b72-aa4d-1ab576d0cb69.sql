ALTER FUNCTION public.delete_campaign_post(uuid,uuid,boolean) SECURITY INVOKER;
GRANT INSERT ON public.deleted_social_posts TO authenticated;
CREATE POLICY deleted_social_posts_workspace_insert ON public.deleted_social_posts FOR INSERT TO authenticated WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY queue_workspace_delete ON public.campaign_activity_queue;
CREATE POLICY queue_workspace_delete ON public.campaign_activity_queue FOR DELETE TO authenticated USING (public.ws_current_access(workspace_owner_id));