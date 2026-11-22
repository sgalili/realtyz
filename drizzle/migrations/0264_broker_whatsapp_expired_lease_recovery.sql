CREATE OR REPLACE FUNCTION public.claim_broker_whatsapp_job(_worker text) RETURNS SETOF public.broker_whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_whatsapp_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF length(btrim(_worker)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 UPDATE public.broker_whatsapp_jobs SET status='failed',last_error=COALESCE(last_error,'discovery_attempts_exhausted'),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status IN ('pending','running','retry') AND attempts>=3 AND (lease_until IS NULL OR lease_until<now());
 UPDATE public.broker_whatsapp_jobs SET status='unknown',last_error=COALESCE(last_error,'send_interrupted_requires_review'),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='sending' AND (lease_until IS NULL OR lease_until<now());
 SELECT * INTO j FROM public.broker_whatsapp_jobs WHERE status IN ('pending','running','retry','discovered') AND (attempts<3 OR status='discovered') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND public.has_role(created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN (created_by,broker_id)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE public.broker_whatsapp_jobs SET status=CASE WHEN j.status='discovered' THEN 'discovered' ELSE 'running' END,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',worker_id=_worker,attempts=attempts+CASE WHEN j.status='discovered' THEN 0 ELSE 1 END,updated_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_broker_whatsapp_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_whatsapp_job(text) TO service_role;