DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.ext_report_job(text,uuid,boolean,text,text)'::regprocedure);
 definition:=replace(definition,'IF COALESCE(_row.attempts, 0) < 3 THEN','IF COALESCE(_row.attempts, 0) < 3 AND NOT public.fb_group_rejection(_reason) AND NOT EXISTS (SELECT 1 FROM public.fb_user_groups g WHERE g.workspace_owner_id=_row.workspace_owner_id AND g.is_blocked AND public.fb_group_key(g.group_id)=public.fb_group_key(_row.target_ref)) THEN');
 definition:=replace(definition,$s$status = 'failed', publication_status = 'failed'$s$, $s$status = 'failed'$s$);
 EXECUTE definition;
 definition:=pg_get_functiondef('public.ext_claim_jobs(text,integer,text)'::regprocedure);
 definition:=replace(definition,$s$publication_status = CASE WHEN COALESCE(attempts,0) >= 3 THEN 'failed' ELSE publication_status END,$s$,'');
 definition:=replace(definition,'SELECT id FROM public.campaign_activity_queue','SELECT id FROM public.campaign_activity_queue q');
 definition:=replace(definition,$s$AND status = 'pending'$s$, $s$AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM public.fb_user_groups g WHERE g.workspace_owner_id=q.workspace_owner_id AND g.is_blocked AND public.fb_group_key(g.group_id)=public.fb_group_key(q.target_ref))$s$);
 EXECUTE definition;
END $$;