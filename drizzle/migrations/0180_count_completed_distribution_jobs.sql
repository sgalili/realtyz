DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.reserve_distribution_slot()'::regprocedure) INTO body;
 body:=replace(body,'SELECT group_used+count(*) INTO group_used FROM public.campaign_activity_queue q', 'SELECT greatest(group_used,(SELECT count(*) FROM public.campaign_activity_queue done WHERE done.workspace_owner_id=NEW.workspace_owner_id AND done.activity_type=''fb_group_post'' AND done.status=''completed'' AND public.fb_group_key(done.target_ref)=public.fb_group_key(g.group_id) AND (coalesce(done.completed_at,done.scheduled_for) AT TIME ZONE ''Asia/Jerusalem'')::date=d))+count(*) INTO group_used FROM public.campaign_activity_queue q');
 EXECUTE body;
END $$;