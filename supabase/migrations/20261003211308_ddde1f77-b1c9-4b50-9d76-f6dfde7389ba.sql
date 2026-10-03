CREATE OR REPLACE FUNCTION public.submit_edited_group_repost(_workspace_owner_id uuid, _original_job_ids uuid[], _post jsonb, _jobs jsonb)
RETURNS SETOF public.campaign_activity_queue
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE new_log_id uuid; item jsonb; local_id text; run_at timestamptz; old_job public.campaign_activity_queue; original_count integer; new_id uuid; group_ids text[];
BEGIN
 IF _original_job_ids IS NULL THEN RAISE EXCEPTION 'Original job IDs are required'; END IF;
 IF auth.uid() IS NULL OR NOT public.ws_current_access(_workspace_owner_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
 IF COALESCE(trim(_post->>'body'),'')='' OR jsonb_typeof(_jobs) IS DISTINCT FROM 'array' OR jsonb_array_length(_jobs)=0 THEN RAISE EXCEPTION 'Post text and selected groups are required'; END IF;
 IF jsonb_array_length(_jobs)>100 THEN RAISE EXCEPTION 'Too many group targets'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_workspace_owner_id::text, 19));
 original_count := 0;
 FOR old_job IN SELECT * FROM public.campaign_activity_queue WHERE workspace_owner_id=_workspace_owner_id AND id=ANY(_original_job_ids) AND activity_type='fb_group_post' ORDER BY id FOR UPDATE LOOP
  original_count := original_count+1;
  IF old_job.status IN ('processing','posting','claimed') OR old_job.claim_expires_at>now() THEN RAISE EXCEPTION 'הפרסום המקורי פעיל כרגע. יש להמתין לסיום לפני פרסום מחדש.'; END IF;
 END LOOP;
 IF original_count<>cardinality(_original_job_ids) THEN RAISE EXCEPTION 'Original jobs missing or workspace access denied'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_jobs) j WHERE COALESCE(j->>'group_id','') !~ '^[a-zA-Z0-9._-]+$') THEN RAISE EXCEPTION 'Invalid group target'; END IF;
 IF (SELECT count(DISTINCT j->>'group_id') FROM jsonb_array_elements(_jobs) j)<>jsonb_array_length(_jobs) THEN RAISE EXCEPTION 'Duplicate group target'; END IF;
 run_at := COALESCE(NULLIF(_post->>'scheduled_at','')::timestamptz, now());
 IF NULLIF(_post->>'scheduled_at','') IS NOT NULL AND run_at<=now() THEN RAISE EXCEPTION 'יש לבחור מועד עתידי'; END IF;
 SELECT array_agg(j->>'group_id') INTO group_ids FROM jsonb_array_elements(_jobs) j;
 UPDATE public.campaign_activity_queue SET status='cancelled',last_error='replaced_by_edited_repost',updated_at=now() WHERE workspace_owner_id=_workspace_owner_id AND id=ANY(_original_job_ids) AND status IN ('pending','scheduled','failed','error');
 INSERT INTO public.campaign_logs(user_id,workspace_owner_id,campaign_name,channel,message_body,media_urls,group_ids,first_comment,listing_id,status,sent_at,provider_response)
 VALUES(_workspace_owner_id,_workspace_owner_id,COALESCE(NULLIF(_post->>'title',''),'פרסום מחדש'),'facebook',_post->>'body',COALESCE(_post->'media_urls','[]'::jsonb),to_jsonb(group_ids),NULLIF(_post->>'first_comment',''),NULLIF(_post->>'listing_id','')::uuid,CASE WHEN run_at>now() THEN 'scheduled' ELSE 'publishing' END,run_at,jsonb_build_object('repost_of_job_ids',to_jsonb(_original_job_ids),'repost_settings',_post)) RETURNING id INTO new_log_id;
 FOR item IN SELECT value FROM jsonb_array_elements(_jobs) LOOP
  local_id:=gen_random_uuid()::text; new_id:=gen_random_uuid();
  RETURN QUERY INSERT INTO public.campaign_activity_queue(id,workspace_owner_id,created_by,activity_type,target_ref,target_label,payload,status,scheduled_for,publication_status,runner)
  VALUES(new_id,_workspace_owner_id,auth.uid(),'fb_group_post','https://www.facebook.com/groups/'||(item->>'group_id')||'/',COALESCE(item->>'group_name',item->>'group_id'),jsonb_build_object('campaign_log_id',new_log_id,'local_id',local_id,'job',jsonb_build_object('id',local_id,'cloudId',new_id,'type','group_post','workspaceOwnerId',_workspace_owner_id,'text',COALESCE(NULLIF(item->>'text',''),_post->>'body'),'sourceText',_post->>'body','groupUrl','https://www.facebook.com/groups/'||(item->>'group_id')||'/','groupName',COALESCE(item->>'group_name',item->>'group_id'),'firstComment',NULLIF(_post->>'first_comment',''),'images',COALESCE(_post->'media_urls','[]'::jsonb),'link',_post->'link','listing',_post->'listing','status','pending','stage','queued','scheduledTime',extract(epoch from run_at)*1000,'createdAt',extract(epoch from now())*1000)),'pending',run_at,'pending_time_bank','extension') RETURNING *;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.submit_edited_group_repost(uuid,uuid[],jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_edited_group_repost(uuid,uuid[],jsonb,jsonb) TO authenticated;