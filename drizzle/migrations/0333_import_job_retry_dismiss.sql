CREATE OR REPLACE FUNCTION public.control_blocked_import_job(_id uuid, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j public.broker_import_jobs;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _action NOT IN ('retry','dismiss') THEN RAISE EXCEPTION 'invalid_job_action'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF j.id IS NULL OR j.status='completed' THEN RAISE EXCEPTION 'invalid_job_action'; END IF;
 IF _action='retry' THEN
  UPDATE public.broker_import_jobs SET status='running', error=NULL,
   checkpoint=(checkpoint-'terminalReason'-'lastError'-'waitReason'-'waitUntil'-'itemRetries')||jsonb_build_object('transientRetries',0,'rateRetries',0,'pauseReason',NULL,'autoContinue',true,'manualRetryAt',extract(epoch FROM clock_timestamp())*1000),
   lease_token=NULL, lease_until=NULL, updated_at=now() WHERE id=_id;
 ELSE
  UPDATE public.broker_import_jobs SET status='failed', error='הייבוא נעצר ידנית על ידי מנהל',
   checkpoint=checkpoint||jsonb_build_object('pauseReason','user','autoContinue',false,'dismissedAt',extract(epoch FROM clock_timestamp())*1000,'dismissedBy',auth.uid()),
   lease_token=NULL, lease_until=NULL, updated_at=now() WHERE id=_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.control_blocked_import_job(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.control_blocked_import_job(uuid,text) TO authenticated, service_role;