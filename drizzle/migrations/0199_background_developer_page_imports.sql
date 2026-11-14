CREATE TABLE public.developer_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_owner_id uuid NOT NULL,
 requested_by uuid NOT NULL,
 source_url text NOT NULL,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
 stage text NOT NULL DEFAULT 'profile' CHECK(stage IN ('profile','projects','completed')),
 developer_id uuid REFERENCES public.developers(id) ON DELETE SET NULL,
 company jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
GRANT SELECT ON public.developer_import_jobs TO authenticated;
GRANT ALL ON public.developer_import_jobs TO service_role;
ALTER TABLE public.developer_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read developer import jobs" ON public.developer_import_jobs FOR SELECT TO authenticated USING(public.ws_current_access(workspace_owner_id));
CREATE UNIQUE INDEX developer_import_active_source ON public.developer_import_jobs(workspace_owner_id,source_url) WHERE status='running';
CREATE INDEX developer_import_workspace_created ON public.developer_import_jobs(workspace_owner_id,created_at DESC);

CREATE TABLE public.developer_import_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES public.developer_import_jobs(id) ON DELETE CASCADE,
 url text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('profile','project')),
 fetch_required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,url)
);
GRANT SELECT ON public.developer_import_pages TO authenticated;
GRANT ALL ON public.developer_import_pages TO service_role;
ALTER TABLE public.developer_import_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read developer import pages" ON public.developer_import_pages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.developer_import_jobs j WHERE j.id=job_id AND public.ws_current_access(j.workspace_owner_id)));
CREATE INDEX developer_import_pages_ready ON public.developer_import_pages(job_id,status,next_attempt_at,created_at);

CREATE FUNCTION public.claim_developer_import_page(_job uuid)
RETURNS SETOF public.developer_import_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.developer_import_jobs; p public.developer_import_pages; token uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
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
 RETURN QUERY SELECT * FROM public.developer_import_pages WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.claim_developer_import_page(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_developer_import_page(uuid) TO service_role;

CREATE FUNCTION public.dispatch_developer_import_retry(_id uuid,_schedule_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.developer_import_jobs WHERE id=_id AND status='running' AND (lease_until IS NULL OR lease_until<now()) AND next_attempt_at<=now()) THEN
  PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/developer-import-jobs',headers:=public.internal_call_headers(),body:=jsonb_build_object('action','step','job_id',_id),timeout_milliseconds:=55000);
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname=_schedule_name) THEN PERFORM cron.unschedule(_schedule_name); END IF;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_developer_import_retry(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_developer_import_retry(uuid,text) TO service_role;

CREATE FUNCTION public.wake_developer_import_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule_name text; retry_at timestamp;
BEGIN
 IF NEW.status='running' AND NEW.lease_token IS NULL THEN
  IF NEW.next_attempt_at>now() THEN
   schedule_name:='developer-import-retry-'||NEW.id::text;
   retry_at=date_trunc('minute',NEW.next_attempt_at AT TIME ZONE 'UTC')+interval '1 minute';
   IF EXISTS(SELECT 1 FROM cron.job WHERE jobname=schedule_name) THEN PERFORM cron.unschedule(schedule_name); END IF;
   PERFORM cron.schedule(schedule_name,to_char(retry_at,'MI HH24 DD MM *'),format('SELECT public.dispatch_developer_import_retry(%L,%L)',NEW.id::text,schedule_name));
  ELSE
   PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/developer-import-jobs',headers:=public.internal_call_headers(),body:=jsonb_build_object('action','step','job_id',NEW.id),timeout_milliseconds:=55000);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER developer_import_wake AFTER INSERT OR UPDATE OF status,next_attempt_at,lease_token ON public.developer_import_jobs FOR EACH ROW EXECUTE FUNCTION public.wake_developer_import_job();