
-- ============================================================================
-- Security hardening migration
-- ============================================================================

-- 1) ai_content_logs: scope SELECT to creator or admins
DROP POLICY IF EXISTS "Authenticated users can read ai_content_logs" ON public.ai_content_logs;
DROP POLICY IF EXISTS "authenticated_select_ai_content_logs" ON public.ai_content_logs;
CREATE POLICY "ai_content_logs_select_own_or_admin"
  ON public.ai_content_logs FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_or_above(auth.uid()));

-- 2) campaigns: restrict to admins
DROP POLICY IF EXISTS "Authenticated users can read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Authenticated users can insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Authenticated users can update campaigns" ON public.campaigns;
CREATE POLICY "campaigns_admin_select" ON public.campaigns FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));
CREATE POLICY "campaigns_admin_insert" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_above(auth.uid()));
CREATE POLICY "campaigns_admin_update" ON public.campaigns FOR UPDATE TO authenticated
  USING (public.is_admin_or_above(auth.uid()))
  WITH CHECK (public.is_admin_or_above(auth.uid()));

-- 3) chat_history: scope by lead workspace
DROP POLICY IF EXISTS "Authenticated users can read chat_history" ON public.chat_history;
CREATE POLICY "chat_history_select_by_lead_workspace"
  ON public.chat_history FOR SELECT TO authenticated
  USING (
    public.is_admin_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = chat_history.lead_id
        AND (l.assigned_to = auth.uid() OR public.shares_workspace_with(l.assigned_to, auth.uid()))
    )
  );

-- 4) contact_submissions: admins only for reads
DROP POLICY IF EXISTS "Authenticated users can read contact_submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Authenticated users can update contact_submissions" ON public.contact_submissions;
CREATE POLICY "contact_submissions_admin_select" ON public.contact_submissions FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));
CREATE POLICY "contact_submissions_admin_update" ON public.contact_submissions FOR UPDATE TO authenticated
  USING (public.is_admin_or_above(auth.uid()))
  WITH CHECK (public.is_admin_or_above(auth.uid()));

-- 5) deal_room_matches: tighten INSERT
DROP POLICY IF EXISTS "Authenticated can insert matches" ON public.deal_room_matches;
CREATE POLICY "deal_room_matches_insert_own"
  ON public.deal_room_matches FOR INSERT TO authenticated
  WITH CHECK (broker_id = auth.uid() OR public.is_admin_or_above(auth.uid()));

-- 6) fb_comment_drafts: admins only
DROP POLICY IF EXISTS "auth read drafts" ON public.fb_comment_drafts;
DROP POLICY IF EXISTS "auth ins drafts" ON public.fb_comment_drafts;
CREATE POLICY "fb_comment_drafts_admin_select" ON public.fb_comment_drafts FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));
CREATE POLICY "fb_comment_drafts_admin_insert" ON public.fb_comment_drafts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_above(auth.uid()));

-- 7) fb_comment_replies: admins only
DROP POLICY IF EXISTS "auth read replies" ON public.fb_comment_replies;
DROP POLICY IF EXISTS "auth ins replies" ON public.fb_comment_replies;
CREATE POLICY "fb_comment_replies_admin_select" ON public.fb_comment_replies FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));
CREATE POLICY "fb_comment_replies_admin_insert" ON public.fb_comment_replies FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_above(auth.uid()));

-- 8) fb_comments: admins only
DROP POLICY IF EXISTS "auth read comments" ON public.fb_comments;
DROP POLICY IF EXISTS "auth insert comments" ON public.fb_comments;
DROP POLICY IF EXISTS "auth update comments" ON public.fb_comments;
DROP POLICY IF EXISTS "auth delete comments" ON public.fb_comments;
CREATE POLICY "fb_comments_admin_select" ON public.fb_comments FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));
CREATE POLICY "fb_comments_admin_insert" ON public.fb_comments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_above(auth.uid()));
CREATE POLICY "fb_comments_admin_update" ON public.fb_comments FOR UPDATE TO authenticated
  USING (public.is_admin_or_above(auth.uid()))
  WITH CHECK (public.is_admin_or_above(auth.uid()));
CREATE POLICY "fb_comments_admin_delete" ON public.fb_comments FOR DELETE TO authenticated
  USING (public.is_admin_or_above(auth.uid()));

-- 9) fb_engagement_posts: admins only
DROP POLICY IF EXISTS "auth read posts" ON public.fb_engagement_posts;
CREATE POLICY "fb_engagement_posts_admin_select" ON public.fb_engagement_posts FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));

-- 10) leads: scope SELECT and UPDATE by workspace
DROP POLICY IF EXISTS "Team members read leads (junior limited)" ON public.leads;
DROP POLICY IF EXISTS "Team members update leads (junior limited)" ON public.leads;
CREATE POLICY "leads_select_workspace"
  ON public.leads FOR SELECT TO authenticated
  USING (
    ((NOT is_demo) OR public.has_role(auth.uid(), 'admin'::app_role))
    AND (
      public.is_admin_or_above(auth.uid())
      OR assigned_to = auth.uid()
      OR (
        (NOT public.is_junior_agent(auth.uid()))
        AND public.shares_workspace_with(assigned_to, auth.uid())
      )
    )
  );
CREATE POLICY "leads_update_workspace"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_admin_or_above(auth.uid())
      OR assigned_to = auth.uid()
      OR (
        (NOT public.is_junior_agent(auth.uid()))
        AND public.shares_workspace_with(assigned_to, auth.uid())
      )
    )
  );

-- 11) messages: scope SELECT by lead workspace
DROP POLICY IF EXISTS "Authenticated users can read messages" ON public.messages;
CREATE POLICY "messages_select_by_lead_workspace"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_admin_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = messages.lead_id
        AND (l.assigned_to = auth.uid() OR public.shares_workspace_with(l.assigned_to, auth.uid()))
    )
  );

-- 12) tracking_links: admins only
DROP POLICY IF EXISTS "Authenticated users can read tracking links" ON public.tracking_links;
DROP POLICY IF EXISTS "Authenticated users can update tracking links" ON public.tracking_links;
CREATE POLICY "tracking_links_admin_select" ON public.tracking_links FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));
CREATE POLICY "tracking_links_admin_update" ON public.tracking_links FOR UPDATE TO authenticated
  USING (public.is_admin_or_above(auth.uid()))
  WITH CHECK (public.is_admin_or_above(auth.uid()));

-- 13) user_roles: prevent admin from granting admin/super_admin
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can insert non-elevated roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND role NOT IN ('admin'::app_role, 'super_admin'::app_role)
  );
CREATE POLICY "Admins can delete non-elevated roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND role NOT IN ('admin'::app_role, 'super_admin'::app_role)
  );

-- 14) white_label_settings: SELECT scoped to owner or admin
DROP POLICY IF EXISTS "Authenticated can read white_label_settings" ON public.white_label_settings;
CREATE POLICY "white_label_settings_select_own_or_admin"
  ON public.white_label_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_above(auth.uid()));

-- 15) workspace_social_profile: SELECT admins only
DROP POLICY IF EXISTS "Authenticated can read workspace social profile" ON public.workspace_social_profile;
CREATE POLICY "workspace_social_profile_admin_select"
  ON public.workspace_social_profile FOR SELECT TO authenticated
  USING (public.is_admin_or_above(auth.uid()));

-- 16) realtime.messages: add baseline RLS so unauthenticated subscriptions are blocked
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated only realtime subscriptions" ON realtime.messages';
    EXECUTE 'CREATE POLICY "Authenticated only realtime subscriptions" ON realtime.messages FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL)';
  END IF;
END $$;

-- 17) Storage: restrict listing on public buckets (files still publicly retrievable via /object/public)
DROP POLICY IF EXISTS "Public read agency-logos" ON storage.objects;
CREATE POLICY "Owners list agency-logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agency-logos' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "media-library: public read" ON storage.objects;
CREATE POLICY "media-library: owner list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media-library' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 18) Fix mutable search_path on SECURITY DEFINER functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE pronamespace='public'::regnamespace AND proname='enqueue_email' LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- 19) Revoke EXECUTE on internal/trigger SECURITY DEFINER functions from anon/authenticated.
--     These should never be called directly from PostgREST.
DO $$
DECLARE
  fn text;
  internal_funcs text[] := ARRAY[
    'claim_pending_team_invitations()',
    'cleanup_expired_email_login_otps()',
    'cleanup_expired_whatsapp_login_otps()',
    'create_self_workspace_membership()',
    'delete_email(text,bigint)',
    'dispatch_automation_run(uuid)',
    'dispatch_smart_notification(uuid,uuid,text,text,text)',
    'enforce_close_permission()',
    'enforce_trial_lead_cap()',
    'execute_readonly_query(text)',
    'get_homely_password(uuid)',
    'grant_super_admin_to_wa_owner()',
    'log_lead_changes()',
    'move_to_dlq(text,text,bigint,jsonb)',
    'normalize_email_alias()',
    'prevent_duplicate_listing_source_url()',
    'read_email_batch(text,integer,integer)',
    'requeue_stuck_autopilot_jobs()',
    'set_homely_password(uuid,text)',
    'set_social_connection_owner()',
    'trg_automations_on_lead_insert()',
    'trg_automations_on_meeting_booked()',
    'trg_deal_room_match_notify()',
    'trg_lead_hot_notify()',
    'update_leads_updated_at()',
    'update_candidate_pages_updated_at()',
    'update_updated_at_column()',
    'validate_lead_outcome()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_funcs LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- skip if signature does not match
      NULL;
    END;
  END LOOP;
END $$;
