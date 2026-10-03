CREATE OR REPLACE FUNCTION public.continue_group_post_jobs(_workspace_owner_id uuid, _job_ids uuid[], _resubmit boolean DEFAULT false)
RETURNS SETOF public.campaign_activity_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.campaign_activity_queue; new_local_id text;
BEGIN
 IF NOT public.ws_current_access(_workspace_owner_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_owner_id::text, 19));
 FOR r IN SELECT * FROM public.campaign_activity_queue WHERE workspace_owner_id=_workspace_owner_id AND id=ANY(_job_ids) AND activity_type='fb_group_post' ORDER BY id FOR UPDATE LOOP
  IF r.status NOT IN ('failed','error','completed','published','success') THEN CONTINUE; END IF;
  IF r.status IN ('completed','published','success') AND NOT _resubmit THEN CONTINUE; END IF;
  IF EXISTS (SELECT 1 FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=_workspace_owner_id AND q.activity_type='fb_group_post' AND q.id<>r.id AND q.target_ref IS NOT DISTINCT FROM r.target_ref AND q.status IN ('pending','processing','posting','claimed') AND COALESCE(q.payload->'job'->>'sourceText',q.payload->>'body',q.payload->>'text','') = COALESCE(r.payload->'job'->>'sourceText',r.payload->>'body',r.payload->>'text','')) THEN CONTINUE; END IF;
  new_local_id := gen_random_uuid()::text;
  RETURN QUERY UPDATE public.campaign_activity_queue q SET status='pending',publication_status='scheduled',last_error=NULL,attempts=0,cloud_attempts=0,processed_at=NULL,completed_at=NULL,claimed_by=NULL,claim_expires_at=NULL,
   payload=CASE WHEN jsonb_typeof(r.payload->'job')='object' THEN jsonb_set(jsonb_set(r.payload,'{local_id}',to_jsonb(new_local_id)), '{job}', (r.payload->'job' - 'postId' - 'postUrl' - 'error' - 'startedAt' - 'stageAt') || jsonb_build_object('id',new_local_id,'cloudId',r.id,'status','pending','stage','queued','workspaceOwnerId',_workspace_owner_id,'scheduledTime',extract(epoch from r.scheduled_for)*1000)) ELSE r.payload - 'post_url' - 'post_id' END
   WHERE q.id=r.id RETURNING q.*;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.continue_group_post_jobs(uuid,uuid[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.continue_group_post_jobs(uuid,uuid[],boolean) TO authenticated;