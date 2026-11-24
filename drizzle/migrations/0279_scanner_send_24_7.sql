CREATE OR REPLACE FUNCTION public.reserve_broker_wa_scanner_send(_instance text, _phone text, _jitter integer)
 RETURNS SETOF broker_wa_scanner_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.broker_wa_scanner_settings; j public.broker_wa_scanner_jobs; local_now timestamp; today date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.broker_wa_scanner_settings WHERE id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error=CASE WHEN status='sending' THEN 'send_outcome_unknown_no_resend' ELSE 'reply_timeout' END,updated_at=now() WHERE (status='sending' AND send_reserved_at<now()-interval '90 seconds') OR (status='awaiting_reply' AND reply_deadline<now());
 IF NOT s.enabled OR s.paused OR NOT s.connected OR NOT s.webhook_ready OR s.instance_id IS DISTINCT FROM _instance OR s.scanner_phone IS DISTINCT FROM _phone OR s.config_checked_at IS NULL OR s.config_checked_at<now()-interval '5 minutes' THEN RETURN; END IF;
 IF _jitter NOT BETWEEN s.jitter_min_seconds AND s.jitter_max_seconds THEN RAISE EXCEPTION 'invalid_jitter'; END IF;
 local_now:=now() AT TIME ZONE 'Asia/Jerusalem'; today:=local_now::date;
 -- 24/7 sending: only pacing, quota, serial line and circuit breaker gate a send.
 IF s.next_send_at>now() THEN RETURN; END IF;
 IF s.budget_day IS DISTINCT FROM today THEN UPDATE public.broker_wa_scanner_settings SET budget_day=today,day_attempts=0 WHERE id; s.day_attempts:=0; END IF;
 IF s.day_attempts>=s.daily_cap THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs WHERE status IN('sending','awaiting_reply')) THEN RETURN; END IF;
 SELECT * INTO j FROM public.broker_wa_scanner_jobs WHERE status='ready' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT public.scanner_broker_eligible(j.broker_id,j.listing_id,j.created_by,j.source_url) OR EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id) THEN
  UPDATE public.broker_wa_scanner_jobs SET status='cancelled',last_error='ineligible_or_contact_saved',updated_at=now() WHERE id=j.id; RETURN;
 END IF;
 IF j.target_phone IS DISTINCT FROM '972559895695' OR length(j.prefilled_message) NOT BETWEEN 1 AND 4000 THEN
  UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error='invalid_prefilled_action',updated_at=now() WHERE id=j.id; RETURN;
 END IF;
 UPDATE public.broker_wa_scanner_settings SET day_attempts=day_attempts+1,next_send_at=now()+make_interval(secs=>_jitter),updated_at=now() WHERE id;
 RETURN QUERY UPDATE public.broker_wa_scanner_jobs SET status='sending',instance_id=_instance,scanner_phone=_phone,send_token=gen_random_uuid(),send_reserved_at=now(),reply_deadline=now()+interval '2 hours',updated_at=now() WHERE id=j.id RETURNING *;
END $function$;