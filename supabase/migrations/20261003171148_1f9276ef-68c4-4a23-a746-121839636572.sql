CREATE OR REPLACE FUNCTION public.delete_campaign_post(p_workspace_owner_id uuid, p_post_id uuid, p_entire_series boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE target public.campaign_logs%ROWTYPE; deleted_ids uuid[]; deleted_texts text[]; series_ids uuid[]; queue_ids uuid[]; local_ids text[]; cal_count int := 0; all_ids text[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(p_workspace_owner_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
 SELECT * INTO target FROM public.campaign_logs WHERE id=p_post_id AND workspace_owner_id=p_workspace_owner_id FOR UPDATE;
 IF NOT FOUND THEN
   WITH removed AS (DELETE FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=p_workspace_owner_id AND (q.payload->>'campaign_log_id'=p_post_id::text OR q.payload->>'post_id'=p_post_id::text OR q.payload->>'series_id'=p_post_id::text) RETURNING id, coalesce(payload->>'local_id',payload->'job'->>'id') AS local_id)
   SELECT array_agg(id),array_agg(local_id) INTO queue_ids,local_ids FROM removed;
   WITH c AS (DELETE FROM public.scheduled_items s WHERE s.workspace_owner_id=p_workspace_owner_id AND (s.metadata->>'campaign_log_id'=p_post_id::text OR s.metadata->>'post_id'=p_post_id::text OR s.metadata->>'series_id'=p_post_id::text OR s.metadata->>'queue_id'=ANY(coalesce(queue_ids,'{}')::text[])) RETURNING 1) SELECT count(*) INTO cal_count FROM c;
   RETURN jsonb_build_object('deleted_ids','[]'::jsonb,'deleted_count',0,'calendar_deleted',cal_count,'queue_ids',to_jsonb(coalesce(queue_ids,'{}'::uuid[])),'local_queue_ids',to_jsonb(coalesce(local_ids,'{}'::text[])));
 END IF;
 SELECT array_agg(id), array_agg(message_body), array_agg(DISTINCT series_id) FILTER (WHERE series_id IS NOT NULL) INTO deleted_ids, deleted_texts, series_ids FROM public.campaign_logs
 WHERE workspace_owner_id=p_workspace_owner_id AND (id=p_post_id OR
 (NOT p_entire_series AND public.campaign_delete_same_post(campaign_logs, target)) OR
 (p_entire_series AND target.series_id IS NOT NULL AND (series_id=target.series_id OR id=target.series_id)) OR
 (p_entire_series AND series_id=p_post_id) OR
 (p_entire_series AND target.series_id IS NULL AND campaign_name IS NOT NULL AND campaign_name=target.campaign_name AND channel=target.channel));
 INSERT INTO public.deleted_social_posts(workspace_owner_id,channel,external_post_id)
 SELECT p_workspace_owner_id,c.channel,ids.external_id FROM public.campaign_logs c CROSS JOIN LATERAL (
 SELECT c.provider_message_id AS external_id UNION SELECT coalesce(v->>'id',v->>'postId') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.provider_response->'postIds')='array' THEN c.provider_response->'postIds' ELSE '[]'::jsonb END) v
 ) ids WHERE c.id=ANY(deleted_ids) AND nullif(ids.external_id,'') IS NOT NULL ON CONFLICT DO NOTHING;
 WITH removed AS (
 DELETE FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=p_workspace_owner_id AND (p_entire_series OR target.status NOT IN ('scheduled','pending','queued') OR q.scheduled_for=target.sent_at OR q.payload->>'campaign_log_id'=p_post_id::text OR q.payload->>'post_id'=p_post_id::text) AND (
 q.payload->>'campaign_log_id'=ANY(deleted_ids::text[]) OR q.payload->>'post_id'=ANY(deleted_ids::text[]) OR
 q.payload->>'text'=ANY(deleted_texts) OR q.payload->>'sourceText'=ANY(deleted_texts) OR
 q.payload->'job'->>'sourceText'=ANY(deleted_texts) OR q.payload->'job'->>'text'=ANY(deleted_texts) OR
 (p_entire_series AND (q.payload->>'series_id'=ANY(coalesce(series_ids,'{}')::text[]) OR q.payload->>'series_id'=p_post_id::text OR q.payload->'job'->>'series_id'=ANY(coalesce(series_ids,'{}')::text[]))) OR
 (p_entire_series AND target.campaign_name IS NOT NULL AND q.payload->>'campaign_name'=target.campaign_name))
 RETURNING id, coalesce(payload->>'local_id',payload->'job'->>'id') AS local_id
 ) SELECT array_agg(id),array_agg(local_id) INTO queue_ids,local_ids FROM removed;
 all_ids := coalesce(deleted_ids::text[],'{}') || coalesce(series_ids::text[],'{}') || coalesce(queue_ids::text[],'{}') || ARRAY[p_post_id::text];
 WITH c AS (
   DELETE FROM public.scheduled_items s WHERE s.workspace_owner_id=p_workspace_owner_id AND (
     s.metadata->>'campaign_log_id'=ANY(all_ids) OR s.metadata->>'post_id'=ANY(all_ids) OR
     s.metadata->>'series_id'=ANY(all_ids) OR s.metadata->>'queue_id'=ANY(all_ids) OR
     (s.item_type IN ('post','social_post','campaign','fb_post','group_post') AND s.content=ANY(deleted_texts)) OR
     (p_entire_series AND target.campaign_name IS NOT NULL AND s.metadata->>'campaign_name'=target.campaign_name))
   RETURNING 1) SELECT count(*) INTO cal_count FROM c;
 DELETE FROM public.campaign_logs WHERE workspace_owner_id=p_workspace_owner_id AND id=ANY(deleted_ids);
 RETURN jsonb_build_object('deleted_ids',to_jsonb(deleted_ids),'deleted_count',cardinality(deleted_ids),'calendar_deleted',cal_count,'queue_ids',to_jsonb(coalesce(queue_ids,'{}'::uuid[])),'local_queue_ids',to_jsonb(coalesce(local_ids,'{}'::text[])));
END;
$function$;