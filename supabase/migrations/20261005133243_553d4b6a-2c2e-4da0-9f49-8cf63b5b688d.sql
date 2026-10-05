CREATE OR REPLACE FUNCTION public.resume_group_posting(_campaign_log_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid := public.current_workspace_owner(); _n int;
BEGIN
  IF auth.uid() IS NULL OR _owner IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  WITH latest AS (
    SELECT q.*, row_number() OVER (PARTITION BY q.target_ref ORDER BY (q.status='completed') DESC, q.created_at DESC, q.id DESC) AS rn
    FROM campaign_activity_queue q
    WHERE q.activity_type = 'fb_group_post' AND q.workspace_owner_id = _owner
      AND q.payload->>'campaign_log_id' = _campaign_log_id::text AND q.status <> 'cancelled'
  ), targets AS (
    SELECT l.id, row_number() OVER (ORDER BY l.created_at, l.id) AS i
    FROM latest l
    WHERE l.rn = 1
      AND (l.status IN ('failed','skipped','pending','ready')
           OR (l.status = 'processing' AND COALESCE(l.claim_expires_at, l.updated_at + interval '3 minutes') < now()
               OR (l.status = 'processing' AND l.updated_at < now() - interval '3 minutes')))
      AND NOT EXISTS (SELECT 1 FROM fb_user_groups g WHERE g.workspace_owner_id=_owner AND g.is_blocked
          AND l.target_ref LIKE '%' || g.group_id || '%')
  )
  UPDATE campaign_activity_queue q SET status='pending', claimed_by=NULL, claim_expires_at=NULL,
    last_error=NULL, scheduled_for = now() + ((t.i - 1) * interval '2 minutes'), updated_at=now()
  FROM targets t WHERE q.id = t.id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;