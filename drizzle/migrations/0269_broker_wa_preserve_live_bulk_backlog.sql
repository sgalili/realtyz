CREATE OR REPLACE FUNCTION public.recover_broker_whatsapp_jobs() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; live_worker boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.broker_whatsapp_jobs WHERE worker_id IS NOT NULL AND status IN('running','completed','not_found','failed') AND updated_at>now()-interval '180 seconds') INTO live_worker;
 UPDATE public.broker_whatsapp_jobs SET status=CASE WHEN status='running' AND attempts<3 THEN 'retry' ELSE 'failed' END,last_error=CASE WHEN status='pending' THEN 'worker_not_connected_no_progress_180s' ELSE 'worker_lease_expired' END,lease_token=NULL,lease_until=NULL,worker_id=NULL,next_attempt_at=now(),updated_at=now()
 WHERE (status='pending' AND updated_at<now()-interval '180 seconds' AND NOT live_worker) OR (status='running' AND (lease_until<now() OR updated_at<now()-interval '180 seconds')) OR (status='retry' AND next_attempt_at<now()-interval '180 seconds' AND NOT live_worker);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.recover_broker_whatsapp_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_broker_whatsapp_jobs() TO service_role;