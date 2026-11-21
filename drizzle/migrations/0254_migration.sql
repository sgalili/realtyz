-- lovable-cron-fallback-reviewed: temporary per-job wake-up, created only while an import waits on a retry (max ~3 min) and unscheduled as soon as it fires
CREATE OR REPLACE FUNCTION public.dispatch_broker_import_retry(_id uuid, _schedule_name text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE j public.broker_import_jobs;
BEGIN
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id;
 IF j.id IS NOT NULL AND j.status='running' AND j.lease_token IS NULL
   AND j.checkpoint->>'waitScope' IN ('developer','broker')
   AND j.checkpoint->>'waitReason' IN ('rate_limit','transient_retry')
   AND COALESCE((j.checkpoint->>'waitUntil')::numeric,0)>extract(epoch FROM clock_timestamp())*1000 THEN
  RETURN;
 END IF;
 IF j.id IS NOT NULL AND j.status='running' AND j.lease_token IS NULL
   AND j.checkpoint->>'waitScope' IN ('developer','broker')
   AND j.checkpoint->>'waitReason' IN ('rate_limit','transient_retry') THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.wake_broker_import_job()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE schedule_name text;
BEGIN
 IF NEW.status='running' AND NEW.lease_token IS NULL THEN
  IF NEW.checkpoint->>'waitScope' IN ('developer','broker')
  AND NEW.checkpoint->>'waitReason' IN ('rate_limit','transient_retry')
  AND COALESCE((NEW.checkpoint->>'waitUntil')::numeric,0)>extract(epoch FROM clock_timestamp())*1000 THEN
   schedule_name='broker-import-retry-'||NEW.id::text;
   IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname=schedule_name) THEN
    PERFORM cron.schedule(schedule_name,'5 seconds',
     format('SELECT public.dispatch_broker_import_retry(%L,%L)',NEW.id::text,schedule_name));
   END IF;
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
END $function$;

REVOKE ALL ON FUNCTION public.dispatch_broker_import_retry(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wake_broker_import_job() FROM PUBLIC, anon, authenticated;