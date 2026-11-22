CREATE OR REPLACE FUNCTION public.normalize_import_auto_continue()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE cp jsonb; source_url text; failure jsonb; attempts integer; consumed boolean:=false;
BEGIN
 NEW.checkpoint:=NEW.checkpoint||jsonb_build_object('autoContinue',true);
 IF TG_OP='UPDATE' THEN
  IF OLD.checkpoint->>'pauseReason'='user' AND auth.role()='service_role' THEN
   NEW.checkpoint:=NEW.checkpoint||jsonb_build_object('pauseReason','user');NEW.status:='paused';
  END IF;
 END IF;

 -- Older deployed workers expose Timeout/connection URLs in the error text.
 -- Do not infer a source from an account name or skip an unmatched cursor.
 IF NEW.status IN ('running','failed') AND NEW.checkpoint->>'execution'='external'
 AND NEW.checkpoint->>'workerFailurePolicy' IS DISTINCT FROM 'url-local-v1'
 AND NEW.checkpoint->>'pauseReason' IS DISTINCT FROM 'user'
 AND NULLIF(NEW.checkpoint->>'terminalReason','') IS NULL
 AND public.has_role(NEW.created_by,'super_admin')
 AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=NEW.created_by)
 AND COALESCE(NEW.checkpoint->'lastError'->>'status','') ~ '^(408|429|5[0-9][0-9])$'
 AND (NEW.checkpoint->'lastError'->>'at' IS DISTINCT FROM OLD.checkpoint->'lastError'->>'at' OR NEW.status='failed') THEN
  cp:=NEW.checkpoint;
  source_url:=COALESCE(cp->'lastError'->>'url',substring(cp->'lastError'->>'message' FROM 'at (https://www\.yad2\.co\.il/[^[:space:]]+)'));
  IF source_url IS NOT NULL THEN
   attempts:=COALESCE((cp->'legacyItemRetries'->>source_url)::integer,0)+1;
   cp:=cp||jsonb_build_object('legacyItemRetries',COALESCE(cp->'legacyItemRetries','{}'::jsonb)||jsonb_build_object(source_url,attempts));
   IF attempts>=3 OR NEW.status='failed' THEN
    IF COALESCE(cp->'activeBroker'->'listing_urls' ? source_url,false) AND NOT COALESCE(cp->'workerListingDoneUrls' ? source_url,false) THEN
     cp:=cp||jsonb_build_object('workerListingDoneUrls',COALESCE(cp->'workerListingDoneUrls','[]'::jsonb)||jsonb_build_array(source_url));consumed:=true;
    ELSIF COALESCE(cp->'workerDeveloper'->'pendingUrls' ? source_url,false) THEN
     cp:=jsonb_set(cp,'{workerDeveloper,pendingUrls}',COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(cp->'workerDeveloper'->'pendingUrls') v WHERE v<>to_jsonb(source_url)),'[]'::jsonb));consumed:=true;
    ELSIF COALESCE(cp->'workerFrontier' ? source_url,false) THEN
     cp:=cp||jsonb_build_object('workerFrontier',COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(cp->'workerFrontier') v WHERE v<>to_jsonb(source_url)),'[]'::jsonb));consumed:=true;
    ELSIF COALESCE(cp->'workerEntities','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('url',source_url)) AND NOT COALESCE(cp->'workerProcessed' ? source_url,false) THEN
     cp:=cp||jsonb_build_object('workerProcessed',COALESCE(cp->'workerProcessed','[]'::jsonb)||jsonb_build_array(source_url));
     IF COALESCE(cp->'workerEntities','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('url',source_url,'kind','developer')) THEN cp:=cp||jsonb_build_object('workerDeveloper',NULL,'workerDeveloperSaved',NULL); END IF;
     consumed:=true;
    END IF;
    IF consumed THEN
     failure:=cp->'lastError'||jsonb_build_object('url',source_url,'attempts',attempts,'legacy_worker_total_failures',cp->'transientRetries');
     cp:=cp||jsonb_build_object('failedSourceVersion',COALESCE((cp->>'failedSourceVersion')::integer,0)+1,'lastFailedSource',failure,'failedSources',COALESCE(cp->'failedSources','[]'::jsonb)||jsonb_build_array(failure),'transientRetries',0,'rateRetries',0,'waitUntil',NULL,'waitReason',NULL);
     cp:=jsonb_set(cp,'{failedSources}',(SELECT jsonb_agg(v ORDER BY n) FROM jsonb_array_elements(cp->'failedSources') WITH ORDINALITY t(v,n) WHERE n>jsonb_array_length(cp->'failedSources')-500));
     NEW.status:='running';NEW.error:=NULL;NEW.skipped:=NEW.skipped+1;
     INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(NEW.created_by,'external_import.item_failed','broker_import_jobs',NEW.id::text,failure);
    END IF;
   END IF;
   NEW.checkpoint:=cp;
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
