CREATE OR REPLACE FUNCTION public.dispatch_broker_import_retry(_id uuid,_schedule_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.broker_import_jobs
  WHERE id=_id AND status='running' AND lease_token IS NULL
   AND checkpoint->>'waitScope'='developer'
   AND checkpoint->>'waitReason' IN ('rate_limit','transient_retry')
   AND COALESCE((checkpoint->>'waitUntil')::numeric,0)<=extract(epoch FROM clock_timestamp())*1000
 ) THEN
  PERFORM net.http_post(
   url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/admin-broker-import-queue',
   headers:=public.internal_call_headers(),
   body:=jsonb_build_object('action','step','job_id',_id),
   timeout_milliseconds:=180000
  );
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname=_schedule_name) THEN
  PERFORM cron.unschedule(_schedule_name);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_broker_import_retry(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_broker_import_retry(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.wake_broker_import_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE retry_at timestamp; schedule_name text;
BEGIN
 IF NEW.status='running' AND NEW.lease_token IS NULL THEN
  IF NEW.checkpoint->>'waitScope'='developer'
   AND NEW.checkpoint->>'waitReason' IN ('rate_limit','transient_retry')
   AND COALESCE((NEW.checkpoint->>'waitUntil')::numeric,0)>extract(epoch FROM clock_timestamp())*1000 THEN
   retry_at=date_trunc('minute',to_timestamp((NEW.checkpoint->>'waitUntil')::numeric/1000) AT TIME ZONE 'UTC')+interval '1 minute';
   schedule_name='broker-import-retry-'||NEW.id::text;
   IF EXISTS(SELECT 1 FROM cron.job WHERE jobname=schedule_name) THEN
    PERFORM cron.unschedule(schedule_name);
   END IF;
   PERFORM cron.schedule(
    schedule_name,
    to_char(retry_at,'MI HH24 DD MM *'),
    format('SELECT public.dispatch_broker_import_retry(%L,%L)',NEW.id::text,schedule_name)
   );
  ELSE
   PERFORM net.http_post(
    url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/admin-broker-import-queue',
    headers:=public.internal_call_headers(),
    body:=jsonb_build_object('action','step','job_id',NEW.id),
    timeout_milliseconds:=180000
   );
  END IF;
 END IF;
 RETURN NEW;
END $$;