CREATE OR REPLACE FUNCTION public.ext_report_job(_token text, _job_id uuid, _ok boolean, _reason text DEFAULT NULL::text, _post_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pair public.extension_pairings;
  _row public.campaign_activity_queue;
  _log_id uuid;
  _remaining int;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings WHERE token = _token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token'); END IF;
  UPDATE public.extension_pairings SET last_seen_at = now() WHERE id = _pair.id;

  SELECT * INTO _row FROM public.campaign_activity_queue WHERE id = _job_id AND workspace_owner_id = _pair.workspace_owner_id;
  IF _row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'job_not_found'); END IF;

  BEGIN _log_id := nullif(_row.payload->>'campaign_log_id','')::uuid; EXCEPTION WHEN others THEN _log_id := NULL; END;

  IF _ok THEN
    UPDATE public.campaign_activity_queue
    SET status = 'completed', publication_status = 'published', completed_at = now(),
        claimed_by = NULL, claim_expires_at = NULL, last_error = NULL,
        payload = COALESCE(payload, '{}'::jsonb)
          || jsonb_build_object('published_via', 'browser_extension')
          || CASE WHEN _post_url IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fb_post_url', _post_url) END
    WHERE id = _row.id;

    IF _log_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.campaign_logs WHERE id=_log_id AND workspace_owner_id=_row.workspace_owner_id) THEN
      SELECT count(*) INTO _remaining FROM public.campaign_activity_queue
       WHERE workspace_owner_id=_row.workspace_owner_id AND payload->>'campaign_log_id'=_log_id::text
         AND status IN ('pending','processing','queued');
      UPDATE public.campaign_logs
         SET status = CASE WHEN _remaining = 0 THEN 'sent' ELSE 'publishing' END,
             sent_at = COALESCE(sent_at, now()),
             group_ids = (SELECT array_agg(DISTINCT g) FROM unnest(COALESCE(group_ids,'{}') || ARRAY[_row.target_ref]) g WHERE g IS NOT NULL)
       WHERE id = _log_id;
    ELSE
      BEGIN
        INSERT INTO public.campaign_logs (user_id, workspace_owner_id, campaign_name, channel, status, message_body, group_ids, sent_at)
        VALUES (COALESCE(_row.created_by, _row.workspace_owner_id), _row.workspace_owner_id,
          'קבוצת פייסבוק · ' || COALESCE(_row.target_label, _row.target_ref, ''), 'facebook', 'sent',
          COALESCE(_row.payload->>'outbound_text', _row.payload->>'body', ''), ARRAY[_row.target_ref], now());
      EXCEPTION WHEN others THEN NULL;
      END;
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'completed');
  END IF;

  IF COALESCE(_row.attempts, 0) < 3 THEN
    UPDATE public.campaign_activity_queue
    SET status = 'pending', claimed_by = NULL, claim_expires_at = NULL,
        scheduled_for = now() + interval '15 minutes',
        last_error = COALESCE(NULLIF(_reason, ''), 'פרסום בדפדפן נכשל')
    WHERE id = _row.id;
    RETURN jsonb_build_object('ok', true, 'status', 'retry');
  END IF;

  UPDATE public.campaign_activity_queue
  SET status = 'failed', publication_status = 'failed', claimed_by = NULL, claim_expires_at = NULL,
      last_error = COALESCE(NULLIF(_reason, ''), 'פרסום בדפדפן נכשל')
  WHERE id = _row.id;
  IF _log_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.campaign_activity_queue
       WHERE payload->>'campaign_log_id'=_log_id::text AND status IN ('pending','processing','queued','completed')) THEN
    UPDATE public.campaign_logs SET status='failed', failure_reason=COALESCE(NULLIF(_reason,''),'פרסום בדפדפן נכשל') WHERE id=_log_id AND status IN ('publishing','queued','pending');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'failed');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ext_report_job(text, uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ext_report_job(text, uuid, boolean, text, text) TO service_role;