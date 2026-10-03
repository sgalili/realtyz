CREATE OR REPLACE FUNCTION public.delete_campaign_post(p_workspace_owner_id uuid, p_post_id uuid, p_entire_series boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target public.campaign_logs%ROWTYPE; deleted_ids uuid[]; deleted_texts text[]; queue_ids uuid[]; local_ids text[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(p_workspace_owner_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
 SELECT * INTO target FROM public.campaign_logs WHERE id=p_post_id AND workspace_owner_id=p_workspace_owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Post not found or already deleted'; END IF;
 SELECT array_agg(id), array_agg(message_body) INTO deleted_ids, deleted_texts FROM public.campaign_logs
 WHERE workspace_owner_id=p_workspace_owner_id AND (id=p_post_id OR
 (NOT p_entire_series AND campaign_name IS NOT DISTINCT FROM target.campaign_name AND channel=target.channel AND created_at=target.created_at) OR
 (p_entire_series AND target.series_id IS NOT NULL AND series_id=target.series_id) OR
 (p_entire_series AND target.series_id IS NULL AND campaign_name IS NOT DISTINCT FROM target.campaign_name AND channel=target.channel AND status IN ('scheduled','pending','queued')));
 INSERT INTO public.deleted_social_posts(workspace_owner_id,channel,external_post_id)
 SELECT p_workspace_owner_id,c.channel,ids.external_id FROM public.campaign_logs c CROSS JOIN LATERAL (
 SELECT c.provider_message_id AS external_id UNION SELECT coalesce(v->>'id',v->>'postId') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.provider_response->'postIds')='array' THEN c.provider_response->'postIds' ELSE '[]'::jsonb END) v
 ) ids WHERE c.id=ANY(deleted_ids) AND nullif(ids.external_id,'') IS NOT NULL ON CONFLICT DO NOTHING;
 WITH removed AS (
 DELETE FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=p_workspace_owner_id AND (
 q.payload->>'campaign_log_id'=ANY(deleted_ids::text[]) OR q.payload->>'post_id'=ANY(deleted_ids::text[]) OR
 q.payload->>'text'=ANY(deleted_texts) OR q.payload->>'sourceText'=ANY(deleted_texts) OR
 q.payload->'job'->>'sourceText'=ANY(deleted_texts) OR q.payload->'job'->>'text'=ANY(deleted_texts) OR
 (target.series_id IS NOT NULL AND p_entire_series AND q.payload->>'series_id'=target.series_id::text))
 RETURNING id, coalesce(payload->>'local_id',payload->'job'->>'id') AS local_id
 ) SELECT array_agg(id),array_agg(local_id) INTO queue_ids,local_ids FROM removed;
 DELETE FROM public.campaign_logs WHERE workspace_owner_id=p_workspace_owner_id AND id=ANY(deleted_ids);
 RETURN jsonb_build_object('deleted_ids',to_jsonb(deleted_ids),'deleted_count',cardinality(deleted_ids),'queue_ids',to_jsonb(coalesce(queue_ids,'{}'::uuid[])),'local_queue_ids',to_jsonb(coalesce(local_ids,'{}'::text[])));
END;
$$;