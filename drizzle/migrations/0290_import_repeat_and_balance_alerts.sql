ALTER TABLE public.broker_import_jobs ADD COLUMN repeat_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.broker_import_jobs ADD COLUMN repeat_seed jsonb;
ALTER TABLE public.broker_import_jobs ADD COLUMN repeat_parent_id uuid REFERENCES public.broker_import_jobs(id);
CREATE UNIQUE INDEX broker_import_repeat_parent_unique ON public.broker_import_jobs(repeat_parent_id) WHERE repeat_parent_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.capture_import_repeat_seed() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.repeat_seed:=COALESCE(NEW.repeat_seed,NEW.checkpoint); RETURN NEW; END $$;
CREATE TRIGGER import_repeat_seed BEFORE INSERT ON public.broker_import_jobs FOR EACH ROW EXECUTE FUNCTION public.capture_import_repeat_seed();
CREATE OR REPLACE FUNCTION public.set_import_repeat(_id uuid,_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs; next_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'job_unavailable'; END IF;
 SELECT id INTO next_id FROM public.broker_import_jobs WHERE repeat_parent_id=j.id;
 IF next_id IS NOT NULL THEN RETURN public.set_import_repeat(next_id,_enabled); END IF;
 UPDATE public.broker_import_jobs SET repeat_enabled=_enabled,repeat_seed=COALESCE(repeat_seed,checkpoint) WHERE id=j.id;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'import.repeat_changed','broker_import_jobs',j.id::text,jsonb_build_object('enabled',_enabled));
 RETURN jsonb_build_object('job_id',j.id,'enabled',_enabled);
END $$;
REVOKE ALL ON FUNCTION public.set_import_repeat(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_import_repeat(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.continue_repeated_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; seed jsonb; pending jsonb;
BEGIN
 IF NOT NEW.repeat_enabled OR NEW.status<>'completed' OR OLD.status<>'running' OR NEW.stage<>'completed' OR NEW.checkpoint IS NOT DISTINCT FROM OLD.checkpoint OR NEW.error IS NOT NULL OR COALESCE((NEW.checkpoint->>'failedSourceVersion')::int,0)>0 OR NOT public.has_role(NEW.created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=NEW.created_by) THEN RETURN NEW; END IF;
 seed:=COALESCE(NEW.repeat_seed,NEW.checkpoint);
 -- Closed pasted lists have no next entity set. Never re-import the same explicit links.
 IF seed->>'source'='urls' AND COALESCE((seed->>'autoDevelopers')::boolean,false)=false THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE created_by=NEW.created_by AND status IN ('running','paused') AND id<>NEW.id) THEN RETURN NEW; END IF;
 c:=seed-ARRAY['workerId','workerHeartbeatAt','brokerResults','developerResults','externalPendingDeveloper','brokerId','accountId','developerId','externalSavedListings','workerFrontier','workerVisited','workerEntities','workerProcessed','workerEnrichment','workerEnrichedIds','activeBroker','workerListingDoneUrls','workerListingIndex','savedListingIds','lastError','terminalReason','waitUntil','waitReason'];
 SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) INTO pending FROM jsonb_array_elements(COALESCE(NEW.checkpoint->'workerEntities','[]'::jsonb)) e WHERE NOT COALESCE(NEW.checkpoint->'workerProcessed','[]'::jsonb) ? (e->>'url');
 IF jsonb_array_length(pending)>0 OR jsonb_array_length(COALESCE(NEW.checkpoint->'workerFrontier','[]'::jsonb))>0 THEN
 c:=c||jsonb_build_object('workerEntities',pending,'workerFrontier',COALESCE(NEW.checkpoint->'workerFrontier','[]'::jsonb),'workerVisited',COALESCE(NEW.checkpoint->'workerVisited','[]'::jsonb),'workerProcessed',COALESCE(NEW.checkpoint->'workerProcessed','[]'::jsonb));
 ELSE
 -- Exhausted directory: bounded cooldown before a fresh directory pass; saved identities still deduplicate globally.
 c:=c||jsonb_build_object('waitUntil',extract(epoch FROM clock_timestamp())*1000+180000,'waitReason','repeat');
 END IF;
 c:=c||jsonb_build_object('phase',CASE WHEN COALESCE((seed->>'autoDevelopers')::boolean,false) THEN 'developer_discovering' ELSE 'scanning' END);
 INSERT INTO public.broker_import_jobs(workspace_owner_id,created_by,target_brokers,min_listings,max_listings,checkpoint,stage,repeat_enabled,repeat_seed,repeat_parent_id) VALUES(NEW.workspace_owner_id,NEW.created_by,NEW.target_brokers,NEW.min_listings,NEW.max_listings,c,'queued',true,seed,NEW.id) ON CONFLICT (repeat_parent_id) WHERE repeat_parent_id IS NOT NULL DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.continue_repeated_import() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER import_repeat_completion AFTER UPDATE OF status,checkpoint ON public.broker_import_jobs FOR EACH ROW EXECUTE FUNCTION public.continue_repeated_import();
CREATE TABLE public.import_balance_alerts(recipient_id uuid PRIMARY KEY,last_attempt_at timestamptz NOT NULL DEFAULT now(),job_id uuid,notification_id uuid,result jsonb);
GRANT SELECT ON public.import_balance_alerts TO authenticated;
GRANT ALL ON public.import_balance_alerts TO service_role;
ALTER TABLE public.import_balance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_balance_alert_admin_read ON public.import_balance_alerts FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));
CREATE OR REPLACE FUNCTION public.claim_import_balance_alert(_recipient uuid,_job uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_recipient,'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO public.import_balance_alerts(recipient_id,job_id) VALUES(_recipient,_job) ON CONFLICT(recipient_id) DO UPDATE SET last_attempt_at=now(),job_id=EXCLUDED.job_id,notification_id=NULL,result=NULL WHERE import_balance_alerts.last_attempt_at<now()-interval '6 hours' RETURNING recipient_id INTO claimed;
 RETURN claimed IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.claim_import_balance_alert(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_import_balance_alert(uuid,uuid) TO service_role;