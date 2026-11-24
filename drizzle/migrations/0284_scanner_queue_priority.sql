ALTER TABLE public.broker_wa_scanner_jobs ADD COLUMN queue_priority bigint NOT NULL DEFAULT 0;
CREATE INDEX scanner_queue_priority ON public.broker_wa_scanner_jobs(status,queue_priority DESC,created_at,id);
DO $$ DECLARE fn text; BEGIN
 fn:=pg_get_functiondef('public.claim_broker_wa_scanner_source()'::regprocedure);
 IF position('ORDER BY created_at,id' in fn)=0 THEN RAISE EXCEPTION 'unexpected_source_order'; END IF;
 EXECUTE replace(fn,'ORDER BY created_at,id','ORDER BY queue_priority DESC,created_at,id');
 fn:=pg_get_functiondef('public.reserve_broker_wa_scanner_send(text,text,integer)'::regprocedure);
 IF position('ORDER BY created_at,id' in fn)=0 THEN RAISE EXCEPTION 'unexpected_send_order'; END IF;
 EXECUTE replace(fn,'ORDER BY created_at,id','ORDER BY queue_priority DESC,created_at,id');
END $$;
CREATE FUNCTION public.promote_broker_wa_scanner_job(_job uuid,_actor uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_wa_scanner_jobs; p bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.broker_wa_scanner_settings WHERE id FOR UPDATE;
 SELECT * INTO j FROM public.broker_wa_scanner_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR j.status NOT IN('pending_source','ready') THEN RETURN false; END IF;
 IF NOT public.scanner_broker_eligible(j.broker_id,j.listing_id,j.created_by,j.source_url) OR EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id) THEN RETURN false; END IF;
 SELECT coalesce(max(queue_priority),0)+1 INTO p FROM public.broker_wa_scanner_jobs WHERE status IN('pending_source','reading_source','ready');
 UPDATE public.broker_wa_scanner_jobs SET queue_priority=p,updated_at=now() WHERE id=j.id;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'super_admin.scanner_queue_promote','broker_wa_scanner_jobs',j.id::text,jsonb_build_object('queue_priority',p));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.promote_broker_wa_scanner_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.promote_broker_wa_scanner_job(uuid,uuid) TO service_role;