CREATE OR REPLACE FUNCTION public.get_group_posting_progress(_campaign_log_ids uuid[])
RETURNS TABLE(campaign_log_id uuid, total int, completed int, pending int, processing int, stalled int, failed int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH jobs AS (
    SELECT (q.payload->>'campaign_log_id')::uuid AS lid, q.target_ref, q.status,
      (q.status = 'processing' AND COALESCE(q.claim_expires_at, q.updated_at + interval '15 minutes') < now()) AS is_stalled,
      row_number() OVER (PARTITION BY q.payload->>'campaign_log_id', q.target_ref ORDER BY (q.status='completed') DESC, q.created_at DESC) AS rn
    FROM campaign_activity_queue q
    WHERE q.activity_type = 'fb_group_post'
      AND q.workspace_owner_id = public.current_workspace_owner()
      AND public.can_access_workspace_owner(q.workspace_owner_id)
      AND q.payload->>'campaign_log_id' = ANY (SELECT unnest(_campaign_log_ids)::text)
      AND q.status <> 'cancelled'
  )
  SELECT lid, count(*)::int,
    count(*) FILTER (WHERE status = 'completed')::int,
    count(*) FILTER (WHERE status IN ('pending','ready'))::int,
    count(*) FILTER (WHERE status = 'processing' AND NOT is_stalled)::int,
    count(*) FILTER (WHERE is_stalled)::int,
    count(*) FILTER (WHERE status IN ('failed','skipped'))::int
  FROM jobs WHERE rn = 1 GROUP BY lid;
$$;

CREATE OR REPLACE FUNCTION public.resume_group_posting(_campaign_log_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid := public.current_workspace_owner(); _n int;
BEGIN
  IF auth.uid() IS NULL OR _owner IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  WITH targets AS (
    SELECT q.id, row_number() OVER (ORDER BY q.created_at, q.id) AS i
    FROM campaign_activity_queue q
    WHERE q.activity_type = 'fb_group_post' AND q.workspace_owner_id = _owner
      AND q.payload->>'campaign_log_id' = _campaign_log_id::text
      AND (q.status IN ('failed','skipped')
           OR (q.status = 'processing' AND COALESCE(q.claim_expires_at, q.updated_at + interval '15 minutes') < now()))
      AND NOT EXISTS (SELECT 1 FROM campaign_activity_queue d
        WHERE d.activity_type='fb_group_post' AND d.workspace_owner_id=_owner
          AND d.payload->>'campaign_log_id' = _campaign_log_id::text
          AND d.target_ref = q.target_ref AND d.status IN ('completed','pending','ready','processing') AND d.id <> q.id
          AND NOT (d.status='processing' AND COALESCE(d.claim_expires_at, d.updated_at + interval '15 minutes') < now()))
      AND NOT EXISTS (SELECT 1 FROM fb_user_groups g WHERE g.workspace_owner_id=_owner AND g.is_blocked
          AND q.target_ref LIKE '%' || g.group_id || '%')
  )
  UPDATE campaign_activity_queue q SET status='pending', claimed_by=NULL, claim_expires_at=NULL,
    last_error=NULL, scheduled_for = now() + ((t.i - 1) * interval '2 minutes'), updated_at=now()
  FROM targets t WHERE q.id = t.id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.get_group_posting_progress(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_group_posting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_posting_progress(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_group_posting(uuid) TO authenticated;