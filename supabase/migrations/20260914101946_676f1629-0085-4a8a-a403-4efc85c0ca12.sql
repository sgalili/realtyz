-- 1. strict workspace access helper
CREATE OR REPLACE FUNCTION public.ws_current_access(_ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _ws IS NOT NULL
     AND _ws = public.current_workspace_owner()
     AND (
       _ws = auth.uid()
       OR public.is_workspace_member(_ws, auth.uid())
       OR public.has_role(auth.uid(), 'super_admin'::app_role)
     );
$$;

-- 2. columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.campaign_logs ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.interaction_activity_log ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.scheduled_items ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.closing_documents ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.fb_engagement_posts ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;
ALTER TABLE public.contact_submissions ADD COLUMN IF NOT EXISTS workspace_owner_id uuid DEFAULT 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid;
ALTER TABLE public.demo_requests ADD COLUMN IF NOT EXISTS workspace_owner_id uuid DEFAULT 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid;

-- 3. backfill: data belongs to the workspace of its own owner
UPDATE public.leads SET workspace_owner_id = COALESCE(assigned_to, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid) WHERE workspace_owner_id IS NULL;
UPDATE public.listings SET workspace_owner_id = user_id WHERE workspace_owner_id IS NULL;
UPDATE public.campaign_logs SET workspace_owner_id = user_id WHERE workspace_owner_id IS NULL;
UPDATE public.interaction_activity_log SET workspace_owner_id = user_id WHERE workspace_owner_id IS NULL;
UPDATE public.meetings SET workspace_owner_id = user_id WHERE workspace_owner_id IS NULL;
UPDATE public.scheduled_items SET workspace_owner_id = user_id WHERE workspace_owner_id IS NULL;
UPDATE public.closing_documents SET workspace_owner_id = user_id WHERE workspace_owner_id IS NULL;
UPDATE public.contact_submissions SET workspace_owner_id = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid WHERE workspace_owner_id IS NULL;
UPDATE public.demo_requests SET workspace_owner_id = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid WHERE workspace_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_workspace_owner ON public.leads(workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_workspace_owner ON public.listings(workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_workspace_owner ON public.campaign_logs(workspace_owner_id);

-- 4. auto-assign workspace on insert
CREATE OR REPLACE FUNCTION public.set_row_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_own uuid;
BEGIN
  IF NEW.workspace_owner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_ARGV[0] IS NOT NULL THEN
    BEGIN
      v_own := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
    EXCEPTION WHEN others THEN
      v_own := NULL;
    END;
  END IF;
  NEW.workspace_owner_id := COALESCE(public.current_workspace_owner(), v_own, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_ws_owner_leads ON public.leads;
CREATE TRIGGER set_ws_owner_leads BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('assigned_to');
DROP TRIGGER IF EXISTS set_ws_owner_listings ON public.listings;
CREATE TRIGGER set_ws_owner_listings BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('user_id');
DROP TRIGGER IF EXISTS set_ws_owner_campaign_logs ON public.campaign_logs;
CREATE TRIGGER set_ws_owner_campaign_logs BEFORE INSERT ON public.campaign_logs FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('user_id');
DROP TRIGGER IF EXISTS set_ws_owner_activity ON public.interaction_activity_log;
CREATE TRIGGER set_ws_owner_activity BEFORE INSERT ON public.interaction_activity_log FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('user_id');
DROP TRIGGER IF EXISTS set_ws_owner_meetings ON public.meetings;
CREATE TRIGGER set_ws_owner_meetings BEFORE INSERT ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('user_id');
DROP TRIGGER IF EXISTS set_ws_owner_scheduled ON public.scheduled_items;
CREATE TRIGGER set_ws_owner_scheduled BEFORE INSERT ON public.scheduled_items FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('user_id');
DROP TRIGGER IF EXISTS set_ws_owner_closing ON public.closing_documents;
CREATE TRIGGER set_ws_owner_closing BEFORE INSERT ON public.closing_documents FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner('user_id');
DROP TRIGGER IF EXISTS set_ws_owner_campaigns ON public.campaigns;
CREATE TRIGGER set_ws_owner_campaigns BEFORE INSERT ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner(NULL);
DROP TRIGGER IF EXISTS set_ws_owner_fb_posts ON public.fb_engagement_posts;
CREATE TRIGGER set_ws_owner_fb_posts BEFORE INSERT ON public.fb_engagement_posts FOR EACH ROW EXECUTE FUNCTION public.set_row_workspace_owner(NULL);

-- 5. lead access now keyed on the lead's workspace, not on the owner's memberships
CREATE OR REPLACE FUNCTION public.can_access_lead_in_current_workspace(_lead_id uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = _lead_id
        AND public.ws_current_access(l.workspace_owner_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.affiliate_conversation_access aca
      WHERE aca.lead_id = _lead_id
        AND aca.workspace_owner_id = public.current_workspace_owner()
        AND (
          aca.workspace_owner_id = auth.uid()
          OR public.is_workspace_member(aca.workspace_owner_id, auth.uid())
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_campaign_log_owner(_row_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.ws_current_access(public.current_workspace_owner()) AND _row_user IS NOT NULL;
$$;

-- 6. policies: leads
DROP POLICY IF EXISTS leads_select_workspace ON public.leads;
CREATE POLICY leads_select_workspace ON public.leads FOR SELECT TO authenticated
USING (
  ((NOT is_demo) OR has_role(auth.uid(), 'admin'::app_role))
  AND public.ws_current_access(workspace_owner_id)
  AND ((NOT is_junior_agent(auth.uid())) OR assigned_to = auth.uid())
);
DROP POLICY IF EXISTS leads_update_workspace ON public.leads;
CREATE POLICY leads_update_workspace ON public.leads FOR UPDATE TO authenticated
USING (public.ws_current_access(workspace_owner_id) AND ((NOT is_junior_agent(auth.uid())) OR assigned_to = auth.uid()))
WITH CHECK (public.ws_current_access(workspace_owner_id) AND ((NOT is_junior_agent(auth.uid())) OR assigned_to = auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON public.leads;
CREATE POLICY leads_insert_workspace ON public.leads FOR INSERT TO authenticated
WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Only senior roles delete leads" ON public.leads;
CREATE POLICY leads_delete_workspace ON public.leads FOR DELETE TO authenticated
USING (public.ws_current_access(workspace_owner_id) AND can_delete_leads(auth.uid()));

-- 7. listings
DROP POLICY IF EXISTS listings_select_workspace ON public.listings;
CREATE POLICY listings_select_workspace ON public.listings FOR SELECT TO authenticated
USING (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS listings_update_workspace ON public.listings;
CREATE POLICY listings_update_workspace ON public.listings FOR UPDATE TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS listings_delete_workspace ON public.listings;
CREATE POLICY listings_delete_workspace ON public.listings FOR DELETE TO authenticated
USING (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Users can create own listings" ON public.listings;
CREATE POLICY listings_insert_workspace ON public.listings FOR INSERT TO authenticated
WITH CHECK (public.ws_current_access(workspace_owner_id));

-- 8. tables previously scoped through in_current_workspace(user_id)
DROP POLICY IF EXISTS "Users manage own interaction_activity_log" ON public.interaction_activity_log;
CREATE POLICY activity_log_workspace ON public.interaction_activity_log FOR ALL TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Users manage own meetings" ON public.meetings;
CREATE POLICY meetings_workspace ON public.meetings FOR ALL TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Users manage own scheduled_items" ON public.scheduled_items;
CREATE POLICY scheduled_items_workspace ON public.scheduled_items FOR ALL TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Workspace can view closing_documents" ON public.closing_documents;
CREATE POLICY closing_documents_workspace ON public.closing_documents FOR SELECT TO authenticated
USING (public.ws_current_access(workspace_owner_id));

-- 9. campaign_logs by explicit workspace
DROP POLICY IF EXISTS "Workspace members can view campaign_logs" ON public.campaign_logs;
CREATE POLICY campaign_logs_select_workspace ON public.campaign_logs FOR SELECT TO authenticated
USING (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Workspace members can insert campaign_logs" ON public.campaign_logs;
CREATE POLICY campaign_logs_insert_workspace ON public.campaign_logs FOR INSERT TO authenticated
WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Workspace members can update campaign_logs" ON public.campaign_logs;
CREATE POLICY campaign_logs_update_workspace ON public.campaign_logs FOR UPDATE TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
DROP POLICY IF EXISTS "Workspace members can delete campaign_logs" ON public.campaign_logs;
CREATE POLICY campaign_logs_delete_workspace ON public.campaign_logs FOR DELETE TO authenticated
USING (public.ws_current_access(workspace_owner_id));

-- 10. campaigns (was admin-wide / global)
DROP POLICY IF EXISTS campaigns_admin_select ON public.campaigns;
DROP POLICY IF EXISTS campaigns_admin_insert ON public.campaigns;
DROP POLICY IF EXISTS campaigns_admin_update ON public.campaigns;
CREATE POLICY campaigns_workspace_select ON public.campaigns FOR SELECT TO authenticated
USING (public.ws_current_access(workspace_owner_id));
CREATE POLICY campaigns_workspace_insert ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (public.ws_current_access(workspace_owner_id));
CREATE POLICY campaigns_workspace_update ON public.campaigns FOR UPDATE TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));

-- 11. facebook posts / comments / replies / drafts (were admin-wide / global)
CREATE OR REPLACE FUNCTION public.ws_fb_post_access(_post_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fb_engagement_posts p
    WHERE p.id = _post_id AND public.ws_current_access(p.workspace_owner_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.ws_fb_comment_access(_comment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fb_comments c
    WHERE c.id = _comment_id AND public.ws_fb_post_access(c.post_id)
  );
$$;

DROP POLICY IF EXISTS fb_engagement_posts_admin_select ON public.fb_engagement_posts;
CREATE POLICY fb_posts_workspace_all ON public.fb_engagement_posts FOR ALL TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));

DROP POLICY IF EXISTS fb_comments_admin_select ON public.fb_comments;
DROP POLICY IF EXISTS fb_comments_admin_insert ON public.fb_comments;
DROP POLICY IF EXISTS fb_comments_admin_update ON public.fb_comments;
DROP POLICY IF EXISTS fb_comments_admin_delete ON public.fb_comments;
CREATE POLICY fb_comments_workspace_all ON public.fb_comments FOR ALL TO authenticated
USING (public.ws_fb_post_access(post_id)) WITH CHECK (public.ws_fb_post_access(post_id));

DROP POLICY IF EXISTS fb_comment_replies_admin_select ON public.fb_comment_replies;
DROP POLICY IF EXISTS fb_comment_replies_admin_insert ON public.fb_comment_replies;
CREATE POLICY fb_comment_replies_workspace_all ON public.fb_comment_replies FOR ALL TO authenticated
USING (public.ws_fb_comment_access(comment_id)) WITH CHECK (public.ws_fb_comment_access(comment_id));

-- 12. landing submissions scoped to the workspace they were routed to
DROP POLICY IF EXISTS contact_submissions_admin_select ON public.contact_submissions;
DROP POLICY IF EXISTS contact_submissions_admin_update ON public.contact_submissions;
DROP POLICY IF EXISTS "Admins can delete contact_submissions" ON public.contact_submissions;
CREATE POLICY contact_submissions_workspace_select ON public.contact_submissions FOR SELECT TO authenticated
USING (public.ws_current_access(workspace_owner_id));
CREATE POLICY contact_submissions_workspace_update ON public.contact_submissions FOR UPDATE TO authenticated
USING (public.ws_current_access(workspace_owner_id)) WITH CHECK (public.ws_current_access(workspace_owner_id));
CREATE POLICY contact_submissions_workspace_delete ON public.contact_submissions FOR DELETE TO authenticated
USING (public.ws_current_access(workspace_owner_id) AND has_role(auth.uid(), 'admin'::app_role));