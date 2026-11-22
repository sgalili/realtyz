-- Automatic recovery never overrides an explicit operator pause.
CREATE OR REPLACE FUNCTION public.import_job_auto_recoverable(_status text,_checkpoint jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT _status='paused' AND _checkpoint->>'autoContinue'='true'
 AND _checkpoint->>'pauseReason' IS DISTINCT FROM 'user'
 AND NULLIF(_checkpoint->>'terminalReason','') IS NULL;
$$;
REVOKE ALL ON FUNCTION public.import_job_auto_recoverable(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_job_auto_recoverable(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.normalize_import_auto_continue()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.checkpoint:=NEW.checkpoint||jsonb_build_object('autoContinue',true);
 IF TG_OP='UPDATE' THEN
  IF OLD.checkpoint->>'pauseReason'='user' AND auth.role()='service_role' THEN
   NEW.checkpoint:=NEW.checkpoint||jsonb_build_object('pauseReason','user');NEW.status:='paused';
  END IF;
 END IF;
 IF NEW.status='paused' AND NEW.checkpoint->>'pauseReason' IS DISTINCT FROM 'user'
 AND NULLIF(NEW.checkpoint->>'terminalReason','') IS NULL THEN
  IF COALESCE(NEW.error,'') ~* 'client_10020|account.*suspend|billing.*inactive|invalid.*(api.?key|zone)' THEN
   NEW.status:='failed';NEW.checkpoint:=NEW.checkpoint||jsonb_build_object('terminalReason','provider_configuration');
  ELSE NEW.status:='running'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.normalize_import_auto_continue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_import_auto_continue() TO service_role;
CREATE TRIGGER broker_import_auto_continue BEFORE INSERT OR UPDATE OF status,checkpoint ON public.broker_import_jobs
FOR EACH ROW EXECUTE FUNCTION public.normalize_import_auto_continue();
CREATE OR REPLACE FUNCTION public.claim_external_import_job(_worker text) RETURNS SETOF public.broker_import_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF length(btrim(_worker)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE (status='running' OR public.import_job_auto_recoverable(status,checkpoint)) AND checkpoint->>'execution'='external' AND (lease_until IS NULL OR lease_until<now()) AND LEAST(CASE WHEN jsonb_typeof(checkpoint->'waitUntil')='number' THEN (checkpoint->>'waitUntil')::numeric ELSE 0 END,extract(epoch FROM updated_at)*1000+180000)<=extract(epoch FROM clock_timestamp())*1000 AND public.has_role(created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=created_by) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE public.broker_import_jobs SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '180 seconds',step_started_at=now(),updated_at=now(),stage=COALESCE(checkpoint->>'phase','scanning'),checkpoint=checkpoint||jsonb_build_object('workerId',_worker,'workerHeartbeatAt',now(),'autoContinue',true,'pauseReason',NULL)||CASE WHEN j.status='paused' OR j.lease_until<now() THEN jsonb_build_object('autoRecoveredAt',now()) ELSE '{}'::jsonb END WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_external_import_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_external_import_job(text) TO service_role;
CREATE OR REPLACE FUNCTION public.control_broker_import_job(_id uuid,_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs; deadline_ms numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF j.id IS NULL OR j.status='completed' OR _action NOT IN ('pause','resume','reset_cooldown') THEN RAISE EXCEPTION 'invalid_job_action'; END IF;
 IF _action='reset_cooldown' THEN
  IF j.status NOT IN ('paused','failed') OR j.checkpoint->>'waitReason' IS DISTINCT FROM 'rate_limit' THEN RAISE EXCEPTION 'invalid_cooldown_reset'; END IF;
  IF j.lease_until>now() THEN RAISE EXCEPTION 'הפעולה הקודמת עדיין מסתיימת; נסה שוב לאחר סיומה'; END IF;
  UPDATE public.broker_import_jobs SET status='paused',error=NULL,
   checkpoint=(checkpoint-'waitReason'-'waitUntil') || jsonb_build_object('rateRetries',0,'cooldownResetAt',extract(epoch FROM clock_timestamp())*1000,'cooldownResetBy',auth.uid(),'pauseReason','user','autoContinue',true),
   lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=_id;
  RETURN;
 END IF;
 IF _action='resume' AND j.checkpoint->>'waitReason'='rate_limit' THEN
  deadline_ms=COALESCE((j.checkpoint->>'waitUntil')::numeric,0);
  IF deadline_ms>extract(epoch FROM clock_timestamp())*1000 THEN RAISE EXCEPTION 'השהיית בטיחות לאחר 429 עדיין בתוקף; יש להמתין לפני המשך'; END IF;
 END IF;
 UPDATE public.broker_import_jobs SET status=CASE WHEN _action='pause' THEN 'paused' ELSE 'running' END,
 error=CASE WHEN _action='resume' THEN NULL ELSE error END,
 checkpoint=CASE WHEN _action='resume' AND checkpoint->>'waitReason'='rate_limit' THEN checkpoint-'waitReason'-'waitUntil' ELSE checkpoint END||jsonb_build_object('pauseReason',CASE WHEN _action='pause' THEN 'user' ELSE NULL END,'autoContinue',true),
 lease_token=CASE WHEN lease_until<now() THEN NULL ELSE lease_token END,
 lease_until=CASE WHEN lease_until<now() THEN NULL ELSE lease_until END,
 updated_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.control_broker_import_job(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_broker_import_job(uuid,text) TO authenticated;CREATE OR REPLACE FUNCTION public.report_external_import_job(_id uuid,_token uuid,_worker text,_checkpoint jsonb,_counts jsonb,_stage text,_status text,_error text,_release boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs; c jsonb; k text; n numeric; state text; advanced boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR j.checkpoint->>'execution' IS DISTINCT FROM 'external' OR j.lease_token IS DISTINCT FROM _token OR _token IS NULL OR j.lease_until<=now() OR j.checkpoint->>'workerId' IS DISTINCT FROM _worker THEN RAISE EXCEPTION 'stale_worker_lease' USING ERRCODE='40001'; END IF;
 IF NOT public.has_role(j.created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=j.created_by) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF j.status NOT IN ('running','paused') THEN RAISE EXCEPTION 'job_not_active'; END IF;
 IF _status NOT IN ('running','paused','completed','failed') OR jsonb_typeof(_checkpoint)<>'object' OR jsonb_typeof(_counts)<>'object' OR length(_checkpoint::text)>2000000 OR length(_stage) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_progress'; END IF;
 FOR k IN SELECT jsonb_object_keys(_counts) LOOP
  IF k NOT IN ('brokers_done','developers_done','listings_done','projects_done','units_done','skipped') THEN RAISE EXCEPTION 'invalid_counter'; END IF;
  n:=(_counts->>k)::numeric;
  IF n IS NULL OR n<0 OR n<>trunc(n) OR n>2147483647 OR n<(to_jsonb(j)->>k)::numeric THEN RAISE EXCEPTION 'counter_regression'; END IF;
 END LOOP;
 c:=j.checkpoint||(_checkpoint-ARRAY['execution','requestType','source','autoDevelopers','targetDevelopers','totalBrokerUrls','totalDeveloperUrls','expectedProjects','maxProjects','workerId','workerHeartbeatAt','brokerResults','developerResults','externalPendingDeveloper','brokerId','accountId','developerId','externalSavedListings','pauseReason','autoContinue'])||jsonb_build_object('execution','external','workerId',_worker,'workerHeartbeatAt',now());
 advanced:=COALESCE(COALESCE((c->>'failedSourceVersion')::integer,0)=COALESCE((j.checkpoint->>'failedSourceVersion')::integer,0)+1 AND COALESCE((_counts->>'skipped')::integer,j.skipped)>j.skipped AND jsonb_typeof(c->'lastFailedSource')='object' AND length(c->'lastFailedSource'->>'url')>0,false);
 IF COALESCE((c->>'waitUntil')::numeric,0)>extract(epoch FROM clock_timestamp())*1000+180000 THEN RAISE EXCEPTION 'retry_wait_too_long'; END IF;
 IF COALESCE((c->>'transientRetries')::integer,0)>=8 AND _status='running' THEN RAISE EXCEPTION 'retry_limit_reached'; END IF;
 IF COALESCE((c->>'transientRetries')::integer,0)<COALESCE((j.checkpoint->>'transientRetries')::integer,0) AND NOT advanced AND c->>'lastSuccessfulActionAt' IS NOT DISTINCT FROM j.checkpoint->>'lastSuccessfulActionAt' THEN RAISE EXCEPTION 'retry_counter_reset'; END IF;
 state:=CASE WHEN j.status='paused' AND j.checkpoint->>'pauseReason'='user' THEN 'paused' WHEN _status='paused' THEN 'running' ELSE _status END;
 UPDATE public.broker_import_jobs SET checkpoint=c,stage=_stage,status=state,error=CASE WHEN state='failed' THEN COALESCE(NULLIF(left(_error,2000),''),'external_worker_failed') ELSE left(_error,2000) END,brokers_done=COALESCE((_counts->>'brokers_done')::integer,j.brokers_done),developers_done=COALESCE((_counts->>'developers_done')::integer,j.developers_done),listings_done=COALESCE((_counts->>'listings_done')::integer,j.listings_done),projects_done=COALESCE((_counts->>'projects_done')::integer,j.projects_done),units_done=COALESCE((_counts->>'units_done')::integer,j.units_done),skipped=COALESCE((_counts->>'skipped')::integer,j.skipped),lease_token=CASE WHEN _release OR state<>'running' THEN NULL ELSE _token END,lease_until=CASE WHEN _release OR state<>'running' THEN NULL ELSE now()+interval '180 seconds' END,updated_at=now() WHERE id=_id;
 IF advanced THEN INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(j.created_by,'external_import.item_failed','broker_import_jobs',j.id::text,c->'lastFailedSource'); END IF;
 RETURN jsonb_build_object('ok',true,'status',state,'stop',state<>'running','released',_release OR state<>'running');
END $$;
REVOKE ALL ON FUNCTION public.report_external_import_job(uuid,uuid,text,jsonb,jsonb,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.report_external_import_job(uuid,uuid,text,jsonb,jsonb,text,text,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_broker_import_step(_id uuid)
RETURNS SETOF public.broker_import_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.broker_import_jobs SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '180 seconds',step_started_at=now()
 WHERE id=_id AND (status='running' OR public.import_job_auto_recoverable(status,checkpoint))
 AND checkpoint->>'execution' IS DISTINCT FROM 'external' AND (lease_until IS NULL OR lease_until<now())
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_broker_import_step(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_import_step(uuid) TO service_role;
