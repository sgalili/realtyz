CREATE OR REPLACE FUNCTION public.group_post_lineage_jobs(_owner uuid, _log_id uuid)
RETURNS TABLE(job_id uuid, own boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE chain(lid, depth) AS (
    SELECT _log_id, 0
    UNION
    SELECT (q.payload->>'campaign_log_id')::uuid, c.depth + 1
    FROM chain c
    JOIN campaign_logs l ON l.id = c.lid AND l.workspace_owner_id = _owner
    JOIN LATERAL jsonb_array_elements_text(COALESCE(l.provider_response->'repost_of_job_ids','[]'::jsonb)) j(id) ON true
    JOIN campaign_activity_queue q ON q.id::text = j.id AND q.workspace_owner_id = _owner
    WHERE c.depth < 10 AND q.payload ? 'campaign_log_id'
  ), anc_jobs AS (
    SELECT q.id, false AS own FROM chain c
    JOIN campaign_logs l ON l.id = c.lid AND l.workspace_owner_id = _owner
    JOIN LATERAL jsonb_array_elements_text(COALESCE(l.provider_response->'repost_of_job_ids','[]'::jsonb)) j(id) ON true
    JOIN campaign_activity_queue q ON q.id::text = j.id AND q.workspace_owner_id = _owner
    UNION
    SELECT q.id, false FROM chain c JOIN campaign_activity_queue q
      ON q.workspace_owner_id = _owner AND q.payload->>'campaign_log_id' = c.lid::text WHERE c.depth > 0
  )
  SELECT q.id, true FROM campaign_activity_queue q
   WHERE q.workspace_owner_id = _owner AND q.activity_type='fb_group_post' AND q.payload->>'campaign_log_id' = _log_id::text
  UNION ALL
  SELECT id, false FROM anc_jobs WHERE id NOT IN (SELECT q.id FROM campaign_activity_queue q WHERE q.payload->>'campaign_log_id' = _log_id::text);
$$;
REVOKE EXECUTE ON FUNCTION public.group_post_lineage_jobs(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_group_posting_progress(_campaign_log_ids uuid[])
 RETURNS TABLE(campaign_log_id uuid, total integer, completed integer, pending integer, processing integer, stalled integer, failed integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH owner AS (SELECT public.current_workspace_owner() AS o),
  jobs AS (
    SELECT lid, q.target_ref, q.status, lj.own,
      (q.status = 'completed' OR q.publication_status = 'published' OR q.completed_at IS NOT NULL
        OR NULLIF(q.payload->>'fb_post_url','') IS NOT NULL) AS is_done,
      (q.status = 'processing' AND COALESCE(q.claim_expires_at, q.updated_at + interval '15 minutes') < now()) AS is_stalled,
      q.created_at
    FROM owner, unnest(_campaign_log_ids) lid
    CROSS JOIN LATERAL public.group_post_lineage_jobs(owner.o, lid) lj
    JOIN campaign_activity_queue q ON q.id = lj.job_id
    WHERE owner.o IS NOT NULL AND public.can_access_workspace_owner(owner.o)
      AND q.activity_type = 'fb_group_post' AND q.target_ref IS NOT NULL
  ),
  targets AS (SELECT DISTINCT lid, target_ref FROM jobs WHERE own AND status <> 'cancelled'
              UNION SELECT DISTINCT lid, target_ref FROM jobs WHERE is_done),
  pick AS (
    SELECT t.lid, t.target_ref,
      bool_or(j.is_done) AS done,
      (array_agg(j.status ORDER BY j.created_at DESC) FILTER (WHERE j.own AND j.status <> 'cancelled'))[1] AS st,
      bool_or(j.is_stalled AND j.own) AS stalled
    FROM targets t JOIN jobs j ON j.lid = t.lid AND j.target_ref = t.target_ref
    GROUP BY 1,2
  )
  SELECT lid, count(*)::int,
    count(*) FILTER (WHERE done)::int,
    count(*) FILTER (WHERE NOT done AND st IN ('pending','ready'))::int,
    count(*) FILTER (WHERE NOT done AND st = 'processing' AND NOT stalled)::int,
    count(*) FILTER (WHERE NOT done AND stalled)::int,
    count(*) FILTER (WHERE NOT done AND st IN ('failed','skipped'))::int
  FROM pick GROUP BY lid;
$function$;

CREATE OR REPLACE FUNCTION public.resume_group_posting(_campaign_log_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _owner uuid := public.current_workspace_owner(); _n int;
BEGIN
  IF auth.uid() IS NULL OR _owner IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  WITH lineage AS (
    SELECT q.* FROM public.group_post_lineage_jobs(_owner, _campaign_log_id) lj JOIN campaign_activity_queue q ON q.id = lj.job_id
  ), done_targets AS (
    SELECT DISTINCT target_ref FROM lineage
    WHERE status='completed' OR publication_status='published' OR completed_at IS NOT NULL OR NULLIF(payload->>'fb_post_url','') IS NOT NULL
  ), latest AS (
    SELECT q.*, row_number() OVER (PARTITION BY q.target_ref ORDER BY q.created_at DESC, q.id DESC) AS rn
    FROM campaign_activity_queue q
    WHERE q.activity_type = 'fb_group_post' AND q.workspace_owner_id = _owner
      AND q.payload->>'campaign_log_id' = _campaign_log_id::text AND q.status <> 'cancelled'
  ), targets AS (
    SELECT l.id, row_number() OVER (ORDER BY l.created_at, l.id) AS i
    FROM latest l
    WHERE l.rn = 1
      AND l.target_ref NOT IN (SELECT target_ref FROM done_targets)
      AND (l.status IN ('failed','skipped','pending','ready')
           OR (l.status = 'processing' AND (COALESCE(l.claim_expires_at, l.updated_at + interval '3 minutes') < now()
               OR l.updated_at < now() - interval '3 minutes')))
      AND NOT EXISTS (SELECT 1 FROM fb_user_groups g WHERE g.workspace_owner_id=_owner AND g.is_blocked
          AND l.target_ref LIKE '%' || g.group_id || '%')
  )
  UPDATE campaign_activity_queue q SET status='pending', claimed_by=NULL, claim_expires_at=NULL,
    last_error=NULL, scheduled_for = now() + ((t.i - 1) * interval '2 minutes'), updated_at=now()
  FROM targets t WHERE q.id = t.id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  -- Groups already posted in an earlier run are never posted again.
  UPDATE campaign_activity_queue q SET status='cancelled', last_error='already_posted_earlier', updated_at=now()
   WHERE q.workspace_owner_id=_owner AND q.activity_type='fb_group_post'
     AND q.payload->>'campaign_log_id' = _campaign_log_id::text
     AND q.status IN ('pending','ready','failed','skipped')
     AND q.target_ref IN (SELECT DISTINCT target_ref FROM campaign_activity_queue x
        JOIN public.group_post_lineage_jobs(_owner, _campaign_log_id) lj ON lj.job_id = x.id AND NOT lj.own
        WHERE x.status='completed' OR x.publication_status='published' OR x.completed_at IS NOT NULL OR NULLIF(x.payload->>'fb_post_url','') IS NOT NULL);
  RETURN _n;
END $function$;