CREATE FUNCTION public.control_broker_import_job(_id uuid,_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF j.id IS NULL OR j.status='completed' OR _action NOT IN ('pause','resume') THEN RAISE EXCEPTION 'invalid_job_action'; END IF;
 UPDATE public.broker_import_jobs SET status=CASE WHEN _action='pause' THEN 'paused' ELSE 'running' END,error=CASE WHEN _action='resume' THEN NULL ELSE error END,lease_token=CASE WHEN lease_until<now() THEN NULL ELSE lease_token END,lease_until=CASE WHEN lease_until<now() THEN NULL ELSE lease_until END,updated_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.control_broker_import_job(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_broker_import_job(uuid,text) TO authenticated;