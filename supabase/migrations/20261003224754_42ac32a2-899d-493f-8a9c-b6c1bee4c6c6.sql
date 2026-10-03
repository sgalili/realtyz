ALTER TABLE public.campaign_activity_queue
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE OR REPLACE FUNCTION public.ext_metrics_targets(_token text, _limit int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pair public.extension_pairings; _out jsonb;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings WHERE token=_token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_token'); END IF;
  UPDATE public.extension_pairings SET last_seen_at=now() WHERE id=_pair.id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('job_id',id,'post_url',payload->>'fb_post_url')),'[]'::jsonb) INTO _out
  FROM (SELECT id, payload FROM public.campaign_activity_queue
        WHERE workspace_owner_id=_pair.workspace_owner_id AND status='completed'
          AND COALESCE(payload->>'fb_post_url','') ~ '^https://(www\.|m\.)?facebook\.com/'
          AND completed_at > now() - interval '21 days'
          AND (last_synced_at IS NULL OR last_synced_at < now() - interval '3 hours')
        ORDER BY last_synced_at NULLS FIRST, completed_at DESC
        LIMIT LEAST(GREATEST(COALESCE(_limit,5),1),10)) t;
  RETURN jsonb_build_object('ok',true,'targets',_out);
END $$;

CREATE OR REPLACE FUNCTION public.ext_report_metrics(_token text, _job_id uuid, _likes int, _comments int, _shares int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pair public.extension_pairings; _row public.campaign_activity_queue; _log_id uuid;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings WHERE token=_token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_token'); END IF;
  SELECT * INTO _row FROM public.campaign_activity_queue WHERE id=_job_id AND workspace_owner_id=_pair.workspace_owner_id;
  IF _row.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','job_not_found'); END IF;
  UPDATE public.campaign_activity_queue SET
    likes_count = GREATEST(likes_count, LEAST(GREATEST(COALESCE(_likes,0),0),10000000)),
    comments_count = GREATEST(comments_count, LEAST(GREATEST(COALESCE(_comments,0),0),10000000)),
    shares_count = GREATEST(shares_count, LEAST(GREATEST(COALESCE(_shares,0),0),10000000)),
    last_synced_at = now()
  WHERE id=_row.id;
  BEGIN _log_id := nullif(_row.payload->>'campaign_log_id','')::uuid; EXCEPTION WHEN others THEN _log_id := NULL; END;
  IF _log_id IS NOT NULL THEN
    UPDATE public.campaign_logs l SET
      like_count = GREATEST(l.like_count, s.lk), comment_count = GREATEST(l.comment_count, s.cm),
      share_count = GREATEST(l.share_count, s.sh), metrics_updated_at = now()
    FROM (SELECT COALESCE(sum(likes_count),0)::int lk, COALESCE(sum(comments_count),0)::int cm, COALESCE(sum(shares_count),0)::int sh
          FROM public.campaign_activity_queue
          WHERE workspace_owner_id=_row.workspace_owner_id AND payload->>'campaign_log_id'=_log_id::text) s
    WHERE l.id=_log_id AND l.workspace_owner_id=_row.workspace_owner_id;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.ext_metrics_targets(text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ext_report_metrics(text,uuid,int,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ext_metrics_targets(text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ext_report_metrics(text,uuid,int,int,int) TO service_role;