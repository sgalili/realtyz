CREATE TABLE public.broker_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_owner_id uuid NOT NULL, created_by uuid NOT NULL,
 target_brokers integer NOT NULL CHECK(target_brokers BETWEEN 1 AND 100), min_listings integer NOT NULL CHECK(min_listings BETWEEN 1 AND 10), max_listings integer NOT NULL CHECK(max_listings BETWEEN 1 AND 10 AND max_listings>=min_listings),
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','failed')), stage text NOT NULL DEFAULT 'scanning',
 checkpoint jsonb NOT NULL DEFAULT '{}', brokers_done integer NOT NULL DEFAULT 0, listings_done integer NOT NULL DEFAULT 0,
 skipped integer NOT NULL DEFAULT 0, error text, lease_token uuid, lease_until timestamptz, step_started_at timestamptz NOT NULL DEFAULT now(),
 step_average_ms numeric, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broker_import_jobs TO authenticated;
GRANT ALL ON public.broker_import_jobs TO service_role;
ALTER TABLE public.broker_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super Admin import status" ON public.broker_import_jobs FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));
CREATE UNIQUE INDEX broker_import_one_running ON public.broker_import_jobs(created_by) WHERE status='running';
CREATE FUNCTION public.claim_broker_import_step(_id uuid) RETURNS SETOF public.broker_import_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.broker_import_jobs SET lease_token=gen_random_uuid(),lease_until=now()+interval '180 seconds',step_started_at=now()
 WHERE id=_id AND status='running' AND (lease_until IS NULL OR lease_until<now()) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_broker_import_step(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_import_step(uuid) TO service_role;
CREATE FUNCTION public.wake_broker_import_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='running' AND NEW.lease_token IS NULL THEN
 PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/admin-broker-import-queue',headers:=public.internal_call_headers(),body:=jsonb_build_object('action','step','job_id',NEW.id),timeout_milliseconds:=180000);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER broker_import_wake AFTER INSERT OR UPDATE OF checkpoint,status ON public.broker_import_jobs FOR EACH ROW EXECUTE FUNCTION public.wake_broker_import_job();
CREATE FUNCTION public.finalize_queued_broker_setup(_user_id uuid,_license text,_actor uuid,_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR NOT EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE id=_job AND created_by=_actor AND status IN ('running','paused')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _license !~ '^[1-9][0-9]{3,9}$' OR NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user_id AND created_by=_actor AND first_login_at IS NULL) THEN RAISE EXCEPTION 'invalid_pending_broker'; END IF;
 INSERT INTO public.admin_approved_broker_licenses(user_id,license_number,approved_by) VALUES(_user_id,_license,_actor) ON CONFLICT(user_id) DO UPDATE SET license_number=excluded.license_number,approved_by=excluded.approved_by;
 UPDATE public.profiles SET broker_license_number=_license WHERE id=_user_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,'managing_broker') ON CONFLICT(user_id,role) DO NOTHING;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_import.manual_approval','profiles',_user_id::text,jsonb_build_object('license',_license,'job',_job));
END $$;
REVOKE ALL ON FUNCTION public.finalize_queued_broker_setup(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_queued_broker_setup(uuid,text,uuid,uuid) TO service_role;