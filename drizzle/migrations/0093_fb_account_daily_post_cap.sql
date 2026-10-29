CREATE TABLE IF NOT EXISTS public.fb_account_post_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL DEFAULT 'pending',
  error text
);
CREATE INDEX IF NOT EXISTS fb_account_post_attempts_ws_time ON public.fb_account_post_attempts (workspace_owner_id, attempted_at DESC);
GRANT SELECT ON public.fb_account_post_attempts TO authenticated;
GRANT ALL ON public.fb_account_post_attempts TO service_role;
ALTER TABLE public.fb_account_post_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace reads own post attempts" ON public.fb_account_post_attempts
FOR SELECT TO authenticated USING (public.can_access_workspace_owner(workspace_owner_id));

-- Every attempt counts (success, failure, admin rejection): 35 per account per Israel day,
-- with a 3-7 minute server-side gap between attempts.
CREATE OR REPLACE FUNCTION public.fb_claim_cloud_group_post(_job uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE q public.campaign_activity_queue; used integer; last_at timestamptz; gap interval; day_start timestamptz;
BEGIN
  SELECT * INTO q FROM public.campaign_activity_queue WHERE id=_job FOR UPDATE;
  IF q.id IS NULL OR q.status<>'pending' OR q.runner<>'cloud' THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(q.workspace_owner_id::text,0));
  day_start := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
  SELECT count(*), max(attempted_at) INTO used, last_at FROM public.fb_account_post_attempts
   WHERE workspace_owner_id=q.workspace_owner_id AND attempted_at>=day_start;
  IF used>=35 THEN
    UPDATE public.campaign_activity_queue SET last_error='daily_account_cap',
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
  INSERT INTO public.fb_account_post_attempts(workspace_owner_id, job_id) VALUES (q.workspace_owner_id, _job);
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.fb_record_post_attempt_outcome(_job uuid, _ok boolean, _error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.fb_account_post_attempts SET outcome=CASE WHEN _ok THEN 'completed' ELSE 'failed' END, error=left(_error,500)
  WHERE id=(SELECT id FROM public.fb_account_post_attempts WHERE job_id=_job AND outcome='pending' ORDER BY attempted_at DESC LIMIT 1);
$$;
REVOKE ALL ON FUNCTION public.fb_record_post_attempt_outcome(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fb_record_post_attempt_outcome(uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.fb_claim_cloud_group_post(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fb_claim_cloud_group_post(uuid) TO service_role;