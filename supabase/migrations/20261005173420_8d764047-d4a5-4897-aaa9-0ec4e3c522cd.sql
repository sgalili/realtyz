CREATE OR REPLACE FUNCTION public.mark_group_posts_published(_campaign_log_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _owner uuid := public.current_workspace_owner(); _n int;
BEGIN
  IF auth.uid() IS NULL OR _owner IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE campaign_activity_queue q SET status='completed', publication_status='published',
    completed_at=COALESCE(q.completed_at, now()), claimed_by=NULL, claim_expires_at=NULL,
    last_error='manually_marked_published', updated_at=now()
  WHERE q.workspace_owner_id=_owner AND q.activity_type='fb_group_post'
    AND q.payload->>'campaign_log_id' = _campaign_log_id::text
    AND q.status IN ('pending','ready','processing','failed','skipped');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.mark_group_posts_published(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_group_posts_published(uuid) TO authenticated;