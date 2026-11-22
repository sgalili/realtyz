ALTER TABLE public.broker_whatsapp_jobs ADD CONSTRAINT broker_whatsapp_discovery_only CHECK (NOT outreach AND status IN ('pending','running','retry','completed','not_found','failed'));
COMMENT ON COLUMN public.broker_whatsapp_jobs.outreach IS 'DEPRECATED: discovery-only worker; automatic outreach is prohibited';
COMMENT ON COLUMN public.broker_whatsapp_jobs.consent_at IS 'DEPRECATED: discovery-only worker has no outreach consent';
COMMENT ON COLUMN public.broker_whatsapp_jobs.message_id IS 'DEPRECATED: manual messages remain in broker_invitation_sends';
CREATE OR REPLACE FUNCTION public.claim_broker_whatsapp_job(_worker text) RETURNS SETOF public.broker_whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_whatsapp_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF length(btrim(_worker)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 UPDATE public.broker_whatsapp_jobs SET status='failed',last_error=COALESCE(last_error,'discovery_attempts_exhausted'),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status IN ('pending','running','retry') AND attempts>=3 AND (lease_until IS NULL OR lease_until<now());
 SELECT * INTO j FROM public.broker_whatsapp_jobs WHERE status IN ('pending','running','retry') AND attempts<3 AND NOT outreach AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND public.has_role(created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN (created_by,broker_id)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE public.broker_whatsapp_jobs SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',worker_id=_worker,attempts=attempts+1,updated_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_broker_whatsapp_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_whatsapp_job(text) TO service_role;