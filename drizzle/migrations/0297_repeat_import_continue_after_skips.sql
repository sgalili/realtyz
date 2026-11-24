CREATE OR REPLACE FUNCTION public.spawn_repeated_import(j public.broker_import_jobs) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; seed jsonb; pending jsonb; new_id uuid;
BEGIN
 IF NOT j.repeat_enabled THEN RETURN 'disabled'; END IF;
 IF j.status<>'completed' THEN RETURN 'not_completed'; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE repeat_parent_id=j.id) THEN RETURN 'exists'; END IF;
 IF NOT public.has_role(j.created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=j.created_by) THEN RETURN 'forbidden'; END IF;
 seed:=COALESCE(j.repeat_seed,j.checkpoint);
 IF seed->>'source'='urls' AND COALESCE((seed->>'autoDevelopers')::boolean,false)=false THEN RETURN 'urls'; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE created_by=j.created_by AND status IN ('running','paused') AND id<>j.id) THEN RETURN 'busy'; END IF;
 c:=jsonb_build_object('execution','external','source',COALESCE(seed->>'source','agencies'),'requestType',COALESCE(seed->>'requestType','brokers'),'autoDevelopers',COALESCE((seed->>'autoDevelopers')::boolean,false),'expectedProjects',seed->'expectedProjects','maxProjects',seed->'maxProjects','targetDevelopers',seed->'targetDevelopers','totalBrokerUrls',seed->'totalBrokerUrls','totalDeveloperUrls',seed->'totalDeveloperUrls','phase',CASE WHEN COALESCE((seed->>'autoDevelopers')::boolean,false) THEN 'developer_discovering' ELSE 'scanning' END);
 SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) INTO pending FROM jsonb_array_elements(COALESCE(j.checkpoint->'workerEntities','[]'::jsonb)) e WHERE NOT COALESCE(j.checkpoint->'workerProcessed','[]'::jsonb) ? (e->>'url');
 IF jsonb_array_length(pending)>0 OR jsonb_array_length(COALESCE(j.checkpoint->'workerFrontier','[]'::jsonb))>0 THEN
  c:=c||jsonb_build_object('workerEntities',pending,'workerFrontier',COALESCE(j.checkpoint->'workerFrontier','[]'::jsonb),'workerVisited',COALESCE(j.checkpoint->'workerVisited','[]'::jsonb),'workerProcessed',COALESCE(j.checkpoint->'workerProcessed','[]'::jsonb));
 ELSE
  c:=c||jsonb_build_object('waitUntil',extract(epoch FROM clock_timestamp())*1000+180000,'waitReason','repeat');
 END IF;
 INSERT INTO public.broker_import_jobs(workspace_owner_id,created_by,target_brokers,min_listings,max_listings,checkpoint,stage,repeat_enabled,repeat_seed,repeat_parent_id) VALUES(j.workspace_owner_id,j.created_by,j.target_brokers,j.min_listings,j.max_listings,c,'queued',true,seed,j.id) ON CONFLICT (repeat_parent_id) WHERE repeat_parent_id IS NOT NULL DO NOTHING RETURNING id INTO new_id;
 RETURN CASE WHEN new_id IS NULL THEN 'exists' ELSE 'started' END;
END $$;
REVOKE ALL ON FUNCTION public.spawn_repeated_import(public.broker_import_jobs) FROM PUBLIC,anon,authenticated;

-- Skipped single items (failedSourceVersion) no longer block the next batch.
CREATE OR REPLACE FUNCTION public.continue_repeated_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT NEW.repeat_enabled OR NEW.status<>'completed' OR OLD.status<>'running' OR NEW.stage<>'completed' OR NEW.checkpoint IS NOT DISTINCT FROM OLD.checkpoint OR NEW.error IS NOT NULL THEN RETURN NEW; END IF;
 PERFORM public.spawn_repeated_import(NEW);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.continue_repeated_import() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.retry_import_repeat(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'job_unavailable'; END IF;
 RETURN public.spawn_repeated_import(j);
END $$;
REVOKE ALL ON FUNCTION public.retry_import_repeat(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_import_repeat(uuid) TO authenticated;