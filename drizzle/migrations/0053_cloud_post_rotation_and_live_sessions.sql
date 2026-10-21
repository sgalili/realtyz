CREATE OR REPLACE FUNCTION public.fb_prepare_cloud_group_post(_job uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.campaign_activity_queue; g public.fb_user_groups; alt public.fb_user_groups; listing_key text; used integer; cap integer;
BEGIN
 SELECT * INTO q FROM public.campaign_activity_queue WHERE id=_job AND activity_type='fb_group_post' AND runner='cloud' AND status='pending' FOR UPDATE;
 IF q.id IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(q.workspace_owner_id::text,0));
 PERFORM public.fb_rebalance_group_pool(q.workspace_owner_id);
 listing_key:=coalesce(q.payload->>'listing_id',q.payload->>'listingId',q.payload->>'project_ref',q.payload->>'campaign_log_id',q.payload->>'post_id',q.id::text);
 SELECT * INTO g FROM public.fb_user_groups WHERE workspace_owner_id=q.workspace_owner_id AND public.fb_group_key(group_id)=public.fb_group_key(coalesce(q.payload->>'group_url',q.target_ref)) LIMIT 1;
 cap:=greatest(1,coalesce(g.max_posts_per_day,1));
 SELECT count(*) INTO used FROM public.campaign_activity_queue x WHERE x.workspace_owner_id=q.workspace_owner_id AND x.activity_type='fb_group_post' AND x.id<>q.id AND x.status IN ('completed','processing') AND (coalesce(x.completed_at,x.processed_at) AT TIME ZONE 'Asia/Jerusalem')::date=(now() AT TIME ZONE 'Asia/Jerusalem')::date AND public.fb_group_key(coalesce(x.payload->>'group_url',x.target_ref))=public.fb_group_key(g.group_id) AND coalesce(x.payload->>'listing_id',x.payload->>'listingId',x.payload->>'project_ref',x.payload->>'campaign_log_id',x.payload->>'post_id',x.id::text)=listing_key;
 IF g.id IS NOT NULL AND NOT g.is_blocked AND g.join_status='joined' AND g.pool_status='active' AND used<cap THEN RETURN true; END IF;
 IF g.id IS NOT NULL AND used>=cap AND NOT g.is_blocked THEN UPDATE public.fb_user_groups SET pool_status='waiting',waiting_reason='daily_listing_limit',cooldown_until=date_trunc('day',now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem'+interval '1 day' WHERE id=g.id; PERFORM public.fb_rebalance_group_pool(q.workspace_owner_id); END IF;
 SELECT * INTO alt FROM public.fb_user_groups a WHERE a.workspace_owner_id=q.workspace_owner_id AND NOT a.is_blocked AND a.join_status='joined' AND a.is_selected AND a.pool_status IN ('active','waiting') AND (a.cooldown_until IS NULL OR a.cooldown_until<=now()) AND a.id IS DISTINCT FROM g.id AND NOT EXISTS(SELECT 1 FROM public.campaign_activity_queue x WHERE x.workspace_owner_id=q.workspace_owner_id AND x.id<>q.id AND x.activity_type='fb_group_post' AND x.status NOT IN ('failed','cancelled') AND public.fb_group_key(coalesce(x.payload->>'group_url',x.target_ref))=public.fb_group_key(a.group_id) AND coalesce(x.payload->>'listing_id',x.payload->>'listingId',x.payload->>'project_ref',x.payload->>'campaign_log_id',x.payload->>'post_id',x.id::text)=listing_key AND (x.scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date=(q.scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date) ORDER BY (a.pool_status='active') DESC,a.updated_at LIMIT 1;
 IF alt.id IS NULL THEN UPDATE public.campaign_activity_queue SET last_error='no_ready_cloud_group',scheduled_for=now()+interval '15 minutes' WHERE id=q.id; RETURN false; END IF;
 UPDATE public.campaign_activity_queue SET target_ref=alt.group_id,target_label=alt.group_name,payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('group_url',alt.group_url,'group_name',alt.group_name,'rotated_from',q.target_ref) WHERE id=q.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.fb_prepare_cloud_group_post(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fb_prepare_cloud_group_post(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fb_group_session_wake() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.fb_group_join_jobs;
BEGIN
 IF NEW.status='active' AND NEW.cookies_encrypted IS NOT NULL THEN
  FOR j IN SELECT * FROM public.fb_group_join_jobs WHERE workspace_owner_id=NEW.workspace_owner_id AND status='queued' LOOP
   PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/fb-group-manager',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('action','dispatch','job_id',j.id,'dispatch_token',j.dispatch_token));
  END LOOP;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_fb_group_session_wake AFTER INSERT OR UPDATE OF status,cookies_encrypted ON public.fb_cloud_sessions FOR EACH ROW EXECUTE FUNCTION public.fb_group_session_wake();
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fb_cloud_sessions') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.fb_cloud_sessions; END IF; END $$;