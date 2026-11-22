ALTER TABLE public.broker_whatsapp_jobs ADD COLUMN discovered_phone text CHECK (discovered_phone IS NULL OR discovered_phone ~ '^9725[0-9]{8}$');
CREATE OR REPLACE FUNCTION public.recover_broker_whatsapp_jobs() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.broker_whatsapp_jobs SET status=CASE WHEN status='running' AND attempts<3 THEN 'retry' ELSE 'failed' END,last_error=CASE WHEN status='pending' THEN 'worker_not_connected_no_progress_180s' ELSE 'worker_lease_expired' END,lease_token=NULL,lease_until=NULL,worker_id=NULL,next_attempt_at=now(),updated_at=now()
 WHERE (status='pending' AND updated_at<now()-interval '180 seconds') OR (status='running' AND (lease_until<now() OR updated_at<now()-interval '180 seconds')) OR (status='retry' AND next_attempt_at<now()-interval '180 seconds');
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.recover_broker_whatsapp_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_broker_whatsapp_jobs() TO service_role;
CREATE OR REPLACE FUNCTION public.heartbeat_broker_whatsapp_job(_id uuid,_token uuid,_worker text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.broker_whatsapp_jobs SET updated_at=now(),lease_until=now()+interval '120 seconds' WHERE id=_id AND status='running' AND lease_token=_token AND worker_id=_worker AND lease_until>now() AND public.has_role(created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN(created_by,broker_id));
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.heartbeat_broker_whatsapp_job(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_broker_whatsapp_job(uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_broker_whatsapp_job(_worker text) RETURNS SETOF public.broker_whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_whatsapp_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF length(btrim(_worker)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 PERFORM public.recover_broker_whatsapp_jobs();
 UPDATE public.broker_whatsapp_jobs SET status='failed',last_error=COALESCE(last_error,'discovery_attempts_exhausted'),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status IN('pending','running','retry') AND attempts>=3 AND (lease_until IS NULL OR lease_until<now());
 SELECT * INTO j FROM public.broker_whatsapp_jobs WHERE status IN('pending','retry') AND attempts<3 AND NOT outreach AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND public.has_role(created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN(created_by,broker_id)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE public.broker_whatsapp_jobs SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',worker_id=_worker,attempts=attempts+1,updated_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_broker_whatsapp_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_whatsapp_job(text) TO service_role;