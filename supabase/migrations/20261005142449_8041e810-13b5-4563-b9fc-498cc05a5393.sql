CREATE OR REPLACE FUNCTION public.delete_campaign_post(p_workspace_owner_id uuid, p_post_id uuid, p_entire_series boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE target public.campaign_logs%ROWTYPE; deleted_ids uuid[]; queue_ids uuid[]; local_ids text[]; cal_count int := 0; all_ids text[]; root_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(p_workspace_owner_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
 SELECT * INTO target FROM public.campaign_logs WHERE id=p_post_id AND workspace_owner_id=p_workspace_owner_id FOR UPDATE;
 IF NOT FOUND THEN
   WITH removed AS (DELETE FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=p_workspace_owner_id AND (q.payload->>'campaign_log_id'=p_post_id::text OR q.payload->>'post_id'=p_post_id::text OR q.payload->>'series_id'=p_post_id::text) RETURNING id, coalesce(payload->>'local_id',payload->'job'->>'id') AS local_id)
   SELECT array_agg(id),array_agg(local_id) INTO queue_ids,local_ids FROM removed;
   RETURN jsonb_build_object('deleted_ids','[]'::jsonb,'deleted_count',0,'calendar_deleted',0,'queue_ids',to_jsonb(coalesce(queue_ids,'{}'::uuid[])),'local_queue_ids',to_jsonb(coalesce(local_ids,'{}'::text[])));
 END IF;
 root_id := CASE WHEN p_entire_series THEN coalesce(target.series_id, target.id) ELSE NULL END;
 -- Only exact IDs: the card itself, plus (for a series) its own children. Never match by text or name.
 SELECT array_agg(id) INTO deleted_ids FROM public.campaign_logs
 WHERE workspace_owner_id=p_workspace_owner_id AND (id=p_post_id OR (root_id IS NOT NULL AND (id=root_id OR series_id=root_id)));
 INSERT INTO public.deleted_social_posts(workspace_owner_id,channel,external_post_id)
 SELECT p_workspace_owner_id,c.channel,ids.external_id FROM public.campaign_logs c CROSS JOIN LATERAL (
 SELECT c.provider_message_id AS external_id UNION SELECT coalesce(v->>'id',v->>'postId') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.provider_response->'postIds')='array' THEN c.provider_response->'postIds' ELSE '[]'::jsonb END) v
 ) ids WHERE c.id=ANY(deleted_ids) AND nullif(ids.external_id,'') IS NOT NULL ON CONFLICT DO NOTHING;
 all_ids := coalesce(deleted_ids::text[],'{}') || ARRAY[p_post_id::text];
 WITH removed AS (
   DELETE FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=p_workspace_owner_id AND (
     q.payload->>'campaign_log_id'=ANY(all_ids) OR q.payload->>'post_id'=ANY(all_ids) OR
     (root_id IS NOT NULL AND (q.payload->>'series_id'=root_id::text OR q.payload->'job'->>'series_id'=root_id::text)))
   RETURNING id, coalesce(payload->>'local_id',payload->'job'->>'id') AS local_id
 ) SELECT array_agg(id),array_agg(local_id) INTO queue_ids,local_ids FROM removed;
 all_ids := all_ids || coalesce(queue_ids::text[],'{}');
 WITH c AS (
   DELETE FROM public.scheduled_items s WHERE s.workspace_owner_id=p_workspace_owner_id AND (
     s.metadata->>'campaign_log_id'=ANY(all_ids) OR s.metadata->>'post_id'=ANY(all_ids) OR
     s.metadata->>'queue_id'=ANY(all_ids) OR (root_id IS NOT NULL AND s.metadata->>'series_id'=root_id::text))
   RETURNING 1) SELECT count(*) INTO cal_count FROM c;
 DELETE FROM public.campaign_logs WHERE workspace_owner_id=p_workspace_owner_id AND id=ANY(deleted_ids);
 RETURN jsonb_build_object('deleted_ids',to_jsonb(deleted_ids),'deleted_count',coalesce(cardinality(deleted_ids),0),'calendar_deleted',cal_count,'queue_ids',to_jsonb(coalesce(queue_ids,'{}'::uuid[])),'local_queue_ids',to_jsonb(coalesce(local_ids,'{}'::text[])));
END;
$function$;