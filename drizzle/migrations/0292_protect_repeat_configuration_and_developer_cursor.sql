CREATE OR REPLACE FUNCTION public.continue_repeated_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; seed jsonb; pending jsonb;
BEGIN
 IF NOT NEW.repeat_enabled OR NEW.status<>'completed' OR OLD.status<>'running' OR NEW.stage<>'completed' OR NEW.checkpoint IS NOT DISTINCT FROM OLD.checkpoint OR NEW.error IS NOT NULL OR COALESCE((NEW.checkpoint->>'failedSourceVersion')::int,0)>0 OR NOT public.has_role(NEW.created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=NEW.created_by) THEN RETURN NEW; END IF;
 seed:=COALESCE(NEW.repeat_seed,NEW.checkpoint);
 IF seed->>'source'='urls' AND COALESCE((seed->>'autoDevelopers')::boolean,false)=false THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE created_by=NEW.created_by AND status IN ('running','paused') AND id<>NEW.id) THEN RETURN NEW; END IF;
 -- Whitelist immutable run settings instead of copying an in-flight broker/developer checkpoint.
 c:=jsonb_build_object('execution','external','source',COALESCE(seed->>'source','agencies'),'requestType',COALESCE(seed->>'requestType','brokers'),'autoDevelopers',COALESCE((seed->>'autoDevelopers')::boolean,false),'expectedProjects',seed->'expectedProjects','maxProjects',seed->'maxProjects','targetDevelopers',seed->'targetDevelopers','totalBrokerUrls',seed->'totalBrokerUrls','totalDeveloperUrls',seed->'totalDeveloperUrls','phase',CASE WHEN COALESCE((seed->>'autoDevelopers')::boolean,false) THEN 'developer_discovering' ELSE 'scanning' END);
 SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) INTO pending FROM jsonb_array_elements(COALESCE(NEW.checkpoint->'workerEntities','[]'::jsonb)) e WHERE NOT COALESCE(NEW.checkpoint->'workerProcessed','[]'::jsonb) ? (e->>'url');
 IF jsonb_array_length(pending)>0 OR jsonb_array_length(COALESCE(NEW.checkpoint->'workerFrontier','[]'::jsonb))>0 THEN
 c:=c||jsonb_build_object('workerEntities',pending,'workerFrontier',COALESCE(NEW.checkpoint->'workerFrontier','[]'::jsonb),'workerVisited',COALESCE(NEW.checkpoint->'workerVisited','[]'::jsonb),'workerProcessed',COALESCE(NEW.checkpoint->'workerProcessed','[]'::jsonb));
 ELSE
 c:=c||jsonb_build_object('waitUntil',extract(epoch FROM clock_timestamp())*1000+180000,'waitReason','repeat');
 END IF;
 INSERT INTO public.broker_import_jobs(workspace_owner_id,created_by,target_brokers,min_listings,max_listings,checkpoint,stage,repeat_enabled,repeat_seed,repeat_parent_id) VALUES(NEW.workspace_owner_id,NEW.created_by,NEW.target_brokers,NEW.min_listings,NEW.max_listings,c,'queued',true,seed,NEW.id) ON CONFLICT (repeat_parent_id) WHERE repeat_parent_id IS NOT NULL DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.continue_repeated_import() FROM PUBLIC,anon,authenticated;