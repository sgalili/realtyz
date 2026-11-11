CREATE OR REPLACE FUNCTION public.start_fresh_broker_import_job(_actor uuid,_target integer,_min integer,_max integer,_checkpoint jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _target NOT BETWEEN 1 AND 100 OR _min NOT BETWEEN 1 AND 10 OR _max NOT BETWEEN _min AND 10 THEN RAISE EXCEPTION 'invalid_import_parameters'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('broker_import_start:'||_actor::text,0));
 PERFORM id FROM public.broker_import_jobs WHERE created_by=_actor FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.broker_import_jobs WHERE created_by=_actor AND lease_until>now()) THEN RAISE EXCEPTION 'הפעולה הקודמת עדיין מסתיימת; יש לעצור ולהמתין לסיומה לפני ייבוא חדש'; END IF;
 UPDATE public.broker_import_jobs SET status='completed',stage='completed',error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE created_by=_actor AND status IN ('running','paused','failed');
 INSERT INTO public.broker_import_jobs(workspace_owner_id,created_by,target_brokers,min_listings,max_listings,checkpoint)
 VALUES(_actor,_actor,_target,_min,_max,jsonb_build_object('page',1,'deal','sale','rows','[]'::jsonb,'brokers','[]'::jsonb,'brokerIndex',0,'listingIndex',0,'phase','scanning','freshSearch',true)) RETURNING id INTO new_id;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.start_fresh_broker_import_job(uuid,integer,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_fresh_broker_import_job(uuid,integer,integer,integer,jsonb) TO service_role;