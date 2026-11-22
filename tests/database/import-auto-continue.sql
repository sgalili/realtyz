-- Isolated fixture only; never run on a live import.
DO $$
DECLARE j public.broker_import_jobs; n integer; r jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 DELETE FROM public.broker_import_jobs;
 INSERT INTO public.broker_import_jobs(created_by,checkpoint) VALUES('00000000-0000-0000-0000-000000000001','{"execution":"external","phase":"importing"}') RETURNING * INTO j;
 SELECT * INTO j FROM public.claim_external_import_job('w');
 UPDATE public.broker_import_jobs SET status='paused',error='Bright Data TimeoutError' WHERE id=j.id;
 IF (SELECT status FROM public.broker_import_jobs WHERE id=j.id)<>'running' THEN RAISE EXCEPTION 'Error required manual resume'; END IF;
 UPDATE public.broker_import_jobs SET lease_until=now()-interval '1 second' WHERE id=j.id;
 SELECT * INTO j FROM public.claim_external_import_job('w2');
 IF j.checkpoint->>'workerId' IS DISTINCT FROM 'w2' THEN RAISE EXCEPTION 'Stalled lease not reclaimed'; END IF;
 r:=public.report_external_import_job(j.id,j.lease_token,'w2','{"transientRetries":2}','{}','importing','running',NULL,false);
 r:=public.report_external_import_job(j.id,j.lease_token,'w2','{"transientRetries":0,"failedSourceVersion":1,"lastFailedSource":{"url":"https://www.yad2.co.il/realestate/item/bad","attempts":3}}','{"skipped":1}','importing','running',NULL,false);
 IF (SELECT count(*) FROM public.audit_logs WHERE action='external_import.item_failed')<>1 THEN RAISE EXCEPTION 'Failure not recorded permanently'; END IF;
 IF (SELECT skipped FROM public.broker_import_jobs WHERE id=j.id)<>1 THEN RAISE EXCEPTION 'Failed source not counted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.control_broker_import_job(j.id,'pause');
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 r:=public.report_external_import_job(j.id,j.lease_token,'w2','{"pauseReason":null}','{}','importing','running',NULL,false);
 IF r->>'status'<>'paused' THEN RAISE EXCEPTION 'Worker overrode operator pause'; END IF;
 SELECT count(*) INTO n FROM public.claim_external_import_job('w3');
 IF n<>0 THEN RAISE EXCEPTION 'Operator pause automatically resumed'; END IF;
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.control_broker_import_job(j.id,'resume');
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE public.broker_import_jobs SET checkpoint=checkpoint||jsonb_build_object('waitUntil',extract(epoch FROM now())*1000+999999999),updated_at=now()-interval '4 minutes',lease_until=NULL WHERE id=j.id;
 SELECT * INTO j FROM public.claim_external_import_job('w3');
 IF j.checkpoint->>'workerId' IS DISTINCT FROM 'w3' THEN RAISE EXCEPTION 'Invalid long wait blocked recovery'; END IF;
 IF public.import_job_auto_recoverable('paused','{"autoContinue":true,"terminalReason":"provider_configuration"}') THEN RAISE EXCEPTION 'Fatal failure auto-restarted'; END IF;
END $$;

DO $$
DECLARE j public.broker_import_jobs; r jsonb; i integer;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 DELETE FROM public.broker_import_jobs;
 INSERT INTO public.broker_import_jobs(created_by,checkpoint) VALUES('00000000-0000-0000-0000-000000000001','{"execution":"external","phase":"importing","activeBroker":{"broker_id":"b","listing_urls":["https://www.yad2.co.il/realestate/item/bad","https://www.yad2.co.il/realestate/item/next"]},"workerListingDoneUrls":[]}');
 FOR i IN 1..3 LOOP
  SELECT * INTO j FROM public.claim_external_import_job('legacy');
  r:=public.report_external_import_job(j.id,j.lease_token,'legacy',jsonb_build_object('transientRetries',i,'lastError',jsonb_build_object('status',504,'at',i::text,'message','Bright Data TimeoutError at https://www.yad2.co.il/realestate/item/bad')),'{}','importing','running',NULL,true);
 END LOOP;
 SELECT * INTO j FROM public.broker_import_jobs LIMIT 1;
 IF j.status IS DISTINCT FROM 'running' OR j.skipped<>1 OR NOT (j.checkpoint->'workerListingDoneUrls' ? 'https://www.yad2.co.il/realestate/item/bad') THEN RAISE EXCEPTION 'Legacy source did not auto-continue after 3 failures'; END IF;
 IF j.checkpoint->'workerListingDoneUrls' ? 'https://www.yad2.co.il/realestate/item/next' THEN RAISE EXCEPTION 'Next source incorrectly consumed'; END IF;
END $$;