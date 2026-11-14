CREATE OR REPLACE FUNCTION public.claim_developer_import_page(_job uuid)
RETURNS SETOF public.developer_import_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.developer_import_jobs; p public.developer_import_pages; token uuid; schedule_name text; retry_at timestamp;
BEGIN
 UPDATE public.developer_import_jobs SET lease_token=NULL,lease_until=NULL WHERE id=_job AND lease_until<now();
 UPDATE public.developer_import_pages SET status='pending',lease_token=NULL,lease_until=NULL WHERE job_id=_job AND status='running' AND lease_until<now();
 SELECT * INTO j FROM public.developer_import_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease_until>=now() OR j.next_attempt_at>now() THEN RETURN; END IF;
 SELECT * INTO p FROM public.developer_import_pages
  WHERE job_id=_job AND status='pending' AND attempts<5 AND next_attempt_at<=now()
  ORDER BY CASE kind WHEN 'profile' THEN 0 ELSE 1 END,created_at,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 token:=gen_random_uuid();
 UPDATE public.developer_import_pages SET status='running',attempts=attempts+1,lease_token=token,lease_until=now()+interval '55 seconds',error=NULL,updated_at=now() WHERE id=p.id;
 UPDATE public.developer_import_jobs SET lease_token=token,lease_until=now()+interval '55 seconds',updated_at=now() WHERE id=_job;
 schedule_name:='developer-import-lease-'||_job::text;
 retry_at=date_trunc('minute',(now()+interval '1 minute') AT TIME ZONE 'UTC')+interval '1 minute';
 IF EXISTS(SELECT 1 FROM cron.job WHERE cron.job.jobname=schedule_name) THEN PERFORM cron.unschedule(schedule_name); END IF;
 PERFORM cron.schedule(schedule_name,to_char(retry_at,'MI HH24 DD MM *'),format('SELECT public.dispatch_developer_import_retry(%L,%L)',_job::text,schedule_name));
 RETURN QUERY SELECT * FROM public.developer_import_pages WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.claim_developer_import_page(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_developer_import_page(uuid) TO service_role;