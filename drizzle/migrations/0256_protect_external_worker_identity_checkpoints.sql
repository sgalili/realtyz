CREATE OR REPLACE FUNCTION public.report_external_import_job(_id uuid,_token uuid,_worker text,_checkpoint jsonb,_counts jsonb,_stage text,_status text,_error text,_release boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs; c jsonb; k text; n numeric; state text;
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
 c:=j.checkpoint||(_checkpoint-ARRAY['execution','requestType','source','autoDevelopers','targetDevelopers','totalBrokerUrls','totalDeveloperUrls','expectedProjects','maxProjects','workerId','workerHeartbeatAt','brokerResults','developerResults','externalPendingDeveloper','brokerId','accountId','developerId','externalSavedListings'])||jsonb_build_object('execution','external','workerId',_worker,'workerHeartbeatAt',now());
 IF COALESCE((c->>'waitUntil')::numeric,0)>extract(epoch FROM clock_timestamp())*1000+180000 THEN RAISE EXCEPTION 'retry_wait_too_long'; END IF;
 IF COALESCE((c->>'transientRetries')::integer,0)>=8 AND _status='running' THEN RAISE EXCEPTION 'retry_limit_reached'; END IF;
 IF COALESCE((c->>'transientRetries')::integer,0)<COALESCE((j.checkpoint->>'transientRetries')::integer,0) AND c->>'lastSuccessfulActionAt' IS NOT DISTINCT FROM j.checkpoint->>'lastSuccessfulActionAt' THEN RAISE EXCEPTION 'retry_counter_reset'; END IF;
 state:=CASE WHEN j.status='paused' THEN 'paused' ELSE _status END;
 UPDATE public.broker_import_jobs SET checkpoint=c,stage=_stage,status=state,error=CASE WHEN state='failed' THEN COALESCE(NULLIF(left(_error,2000),''),'external_worker_failed') ELSE left(_error,2000) END,brokers_done=COALESCE((_counts->>'brokers_done')::integer,j.brokers_done),developers_done=COALESCE((_counts->>'developers_done')::integer,j.developers_done),listings_done=COALESCE((_counts->>'listings_done')::integer,j.listings_done),projects_done=COALESCE((_counts->>'projects_done')::integer,j.projects_done),units_done=COALESCE((_counts->>'units_done')::integer,j.units_done),skipped=COALESCE((_counts->>'skipped')::integer,j.skipped),lease_token=CASE WHEN _release OR state<>'running' THEN NULL ELSE _token END,lease_until=CASE WHEN _release OR state<>'running' THEN NULL ELSE now()+interval '180 seconds' END,updated_at=now() WHERE id=_id;
 RETURN jsonb_build_object('ok',true,'status',state,'stop',state<>'running','released',_release OR state<>'running');
END $$;
REVOKE ALL ON FUNCTION public.report_external_import_job(uuid,uuid,text,jsonb,jsonb,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.report_external_import_job(uuid,uuid,text,jsonb,jsonb,text,text,text,boolean) TO service_role;