create or replace function public.ext_claim_jobs(_token text, _limit integer default 2, _user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
DECLARE
  _pair public.extension_pairings;
  _jobs jsonb;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings
  WHERE token = _token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  UPDATE public.extension_pairings
  SET last_seen_at = now(),
      user_agent = COALESCE(_user_agent, user_agent)
  WHERE id = _pair.id;

  UPDATE public.campaign_activity_queue
  SET status = 'pending',
      claimed_by = NULL,
      claim_expires_at = NULL,
      last_error = COALESCE(last_error, 'תם הזמן להרצה בדפדפן — הפוסט חוזר לתור')
  WHERE workspace_owner_id = _pair.workspace_owner_id
    AND activity_type = 'fb_group_post'
    AND runner = 'extension'
    AND status = 'processing'
    AND claim_expires_at IS NOT NULL
    AND claim_expires_at < now();

  WITH due AS (
    SELECT id FROM public.campaign_activity_queue
    WHERE workspace_owner_id = _pair.workspace_owner_id
      AND activity_type = 'fb_group_post'
      AND runner = 'extension'
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 2), 5))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.campaign_activity_queue q
    SET status = 'processing',
        claimed_by = _pair.id,
        claim_expires_at = now() + interval '10 minutes',
        processed_at = now(),
        attempts = COALESCE(q.attempts, 0) + 1
    FROM due
    WHERE q.id = due.id
    RETURNING q.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'group_id', c.target_ref,
    'group_name', c.target_label,
    'group_url', COALESCE(c.payload->>'group_url', 'https://www.facebook.com/groups/' || c.target_ref),
    'message', COALESCE(NULLIF(c.payload->>'outbound_text', ''), NULLIF(c.payload->>'body', ''), c.payload->>'text', ''),
    'image_url', c.payload->>'image_url',
    'link', c.payload->>'link',
    'first_comment', c.payload->>'first_comment',
    'attempts', c.attempts
  )), '[]'::jsonb) INTO _jobs FROM claimed c;

  RETURN jsonb_build_object('ok', true, 'workspace_owner_id', _pair.workspace_owner_id, 'jobs', _jobs);
END;
$fn$;