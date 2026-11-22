-- Run against the scratch PostgreSQL fixture in worker/database-test.py, never Production.
DO $$
DECLARE j public.broker_import_jobs; n integer; r jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 BEGIN PERFORM public.claim_external_import_job('test-worker'); RAISE EXCEPTION 'Unprivileged claim succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 INSERT INTO public.broker_import_jobs(created_by,checkpoint) VALUES('00000000-0000-0000-0000-000000000001','{"execution":"external","phase":"importing"}') RETURNING * INTO j;
 IF j.stage<>'queued' THEN RAISE EXCEPTION 'New external job did not wait for worker'; END IF;
 SELECT * INTO j FROM public.claim_external_import_job('test-worker');
 SELECT count(*) INTO n FROM public.claim_external_import_job('another-worker');
 IF n<>0 THEN RAISE EXCEPTION 'Two workers claimed the same job'; END IF;
 SELECT count(*) INTO n FROM public.claim_broker_import_step(j.id);
 IF n<>0 THEN RAISE EXCEPTION 'Legacy function claimed external work'; END IF;
 r:=public.report_external_import_job(j.id,j.lease_token,'test-worker','{"brokerResults":[{"broker_id":"other-tenant"}],"externalPendingDeveloper":{"owner":"other-tenant"}}','{}','importing','running',NULL,false);
 IF EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE id=j.id AND (checkpoint ? 'brokerResults' OR checkpoint ? 'externalPendingDeveloper')) THEN RAISE EXCEPTION 'Worker forged another workspace owner'; END IF;
 r:=public.report_external_import_job(j.id,j.lease_token,'test-worker','{}','{"brokers_done":5,"listings_done":27}','importing','running',NULL,false);
 IF (SELECT listings_done FROM public.broker_import_jobs WHERE id=j.id)<>27 THEN RAISE EXCEPTION 'Committed draft count not retained'; END IF;
 BEGIN PERFORM public.report_external_import_job(j.id,j.lease_token,'test-worker','{}','{"listings_done":26}','importing','running',NULL,false); RAISE EXCEPTION 'Regressing counter accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'counter_regression' THEN RAISE; END IF; END;
 BEGIN PERFORM public.report_external_import_job(j.id,gen_random_uuid(),'test-worker','{}','{}','importing','running',NULL,false); RAISE EXCEPTION 'Wrong worker token accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM public.report_external_import_job(j.id,j.lease_token,'test-worker','{"transientRetries":8}','{}','importing','running',NULL,false); RAISE EXCEPTION 'Ninth retry allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'retry_limit_reached' THEN RAISE; END IF; END;
 UPDATE public.broker_import_jobs SET status='paused',checkpoint=checkpoint||'{"pauseReason":"user"}' WHERE id=j.id;
 r:=public.report_external_import_job(j.id,j.lease_token,'test-worker','{}','{"listings_done":28}','importing','running',NULL,false);
 IF r->>'status'<>'paused' OR NOT (r->>'stop')::boolean THEN RAISE EXCEPTION 'Worker overrode admin pause'; END IF;
END $$;