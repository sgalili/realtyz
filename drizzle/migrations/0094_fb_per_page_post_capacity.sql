ALTER TABLE public.fb_account_post_attempts ADD COLUMN IF NOT EXISTS page_id text;
CREATE INDEX IF NOT EXISTS fb_account_post_attempts_ws_page_time ON public.fb_account_post_attempts (workspace_owner_id, page_id, attempted_at DESC);

CREATE OR REPLACE FUNCTION public.fb_job_page_id(q public.campaign_activity_queue)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(nullif(q.payload->>'page_id',''),
    (SELECT g.page_id FROM public.fb_user_groups g WHERE g.workspace_owner_id=q.workspace_owner_id AND g.group_id=q.target_ref LIMIT 1),
    (SELECT b.page_id FROM public.messenger_page_bindings b WHERE b.owner_id=q.workspace_owner_id ORDER BY b.is_selected DESC NULLS LAST LIMIT 1),
    'account');
$$;
REVOKE ALL ON FUNCTION public.fb_job_page_id(public.campaign_activity_queue) FROM PUBLIC, anon, authenticated;

-- Every attempt counts (success, failure, rejection): 35 per business page per Israel day,
-- and at most 100 per workspace account across all pages, with a 3-7 minute account-wide gap.
CREATE OR REPLACE FUNCTION public.fb_claim_cloud_group_post(_job uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE q public.campaign_activity_queue; used integer; page_used integer; pg text; last_at timestamptz; gap interval; day_start timestamptz;
BEGIN
  SELECT * INTO q FROM public.campaign_activity_queue WHERE id=_job FOR UPDATE;
  IF q.id IS NULL OR q.status<>'pending' OR q.runner<>'cloud' THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(q.workspace_owner_id::text,0));
  pg := public.fb_job_page_id(q);
  day_start := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
  SELECT count(*), count(*) FILTER (WHERE coalesce(page_id,'account')=pg) INTO used, page_used
    FROM public.fb_account_post_attempts WHERE workspace_owner_id=q.workspace_owner_id AND attempted_at>=day_start;
  IF used>=100 OR page_used>=35 THEN
    UPDATE public.campaign_activity_queue SET last_error=CASE WHEN used>=100 THEN 'daily_account_cap' ELSE 'daily_page_cap' END,
      scheduled_for=day_start+interval '1 day'+interval '8 hours'+((abs(hashtext(q.id::text))%3600)*interval '1 second') WHERE id=q.id;
    RETURN false;
  END IF;
  SELECT max(attempted_at) INTO last_at FROM public.fb_account_post_attempts WHERE workspace_owner_id=q.workspace_owner_id;
  gap := interval '180 seconds' + ((abs(hashtext(q.id::text||coalesce(q.cloud_attempts,0)::text))%241)*interval '1 second');
  IF last_at IS NOT NULL AND last_at+gap>now() THEN
    UPDATE public.campaign_activity_queue SET last_error='account_spacing', scheduled_for=last_at+gap WHERE id=q.id;
    RETURN false;
  END IF;
  IF NOT public.fb_prepare_cloud_group_post(_job) THEN RETURN false; END IF;
  UPDATE public.campaign_activity_queue SET status='processing',processed_at=now(),claim_expires_at=now()+interval '10 minutes',cloud_attempts=coalesce(cloud_attempts,0)+1,last_error=NULL WHERE id=_job AND status='pending';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.fb_account_post_attempts(workspace_owner_id, job_id, page_id) VALUES (q.workspace_owner_id, _job, pg);
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.fb_claim_cloud_group_post(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fb_claim_cloud_group_post(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_fb_posting_capacity()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace_owner(); day_start timestamptz; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR ws IS NULL OR NOT public.can_access_workspace_owner(ws) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  day_start := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
  SELECT jsonb_build_object(
    'per_page_limit', 35, 'account_limit', 100,
    'account_used', (SELECT count(*) FROM public.fb_account_post_attempts a WHERE a.workspace_owner_id=ws AND a.attempted_at>=day_start),
    'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('page_id', b.page_id, 'page_name', b.page_name,
        'used', (SELECT count(*) FROM public.fb_account_post_attempts a WHERE a.workspace_owner_id=ws AND a.attempted_at>=day_start AND a.page_id=b.page_id))
        ORDER BY b.page_name)
      FROM public.messenger_page_bindings b WHERE b.owner_id=ws AND coalesce(b.is_platform_shared,false)=false), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_fb_posting_capacity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fb_posting_capacity() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_publishing_history(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, created_at timestamptz, scheduled_for timestamptz, completed_at timestamptz, activity_type text,
  target_label text, target_ref text, status text, publication_status text, last_error text, page_id text, page_name text,
  likes_count integer, comments_count integer, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace_owner();
BEGIN
  IF auth.uid() IS NULL OR ws IS NULL OR NOT public.can_access_workspace_owner(ws) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT q.id, q.created_at, q.scheduled_for, q.completed_at, q.activity_type, q.target_label, q.target_ref, q.status,
    q.publication_status, left(q.last_error,300), pg.pid, b.page_name, q.likes_count, q.comments_count, count(*) OVER()
  FROM public.campaign_activity_queue q
  CROSS JOIN LATERAL (SELECT public.fb_job_page_id(q) AS pid) pg
  LEFT JOIN public.messenger_page_bindings b ON b.owner_id=ws AND b.page_id=pg.pid
  WHERE q.workspace_owner_id=ws
  ORDER BY coalesce(q.completed_at, q.scheduled_for, q.created_at) DESC
  LIMIT least(greatest(_limit,1),100) OFFSET greatest(_offset,0);
END $$;
REVOKE ALL ON FUNCTION public.get_publishing_history(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_publishing_history(integer, integer) TO authenticated;