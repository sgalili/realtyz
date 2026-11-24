-- lovable-cron-fallback-reviewed: event-woken serial registry queue with one-minute lease recovery only during an active batch; removed on completion/cancellation, up to 1440/day while active
CREATE TABLE public.broker_registry_batches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL REFERENCES public.profiles(id), status text NOT NULL DEFAULT 'running' CHECK(status IN('running','completed','cancelled')), lease_token uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.broker_registry_batches TO authenticated; GRANT ALL ON public.broker_registry_batches TO service_role;
ALTER TABLE public.broker_registry_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY registry_batch_admin_read ON public.broker_registry_batches FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()));
CREATE UNIQUE INDEX registry_one_running ON public.broker_registry_batches((true)) WHERE status='running';
CREATE TABLE public.broker_registry_batch_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.broker_registry_batches(id), broker_id uuid NOT NULL REFERENCES public.profiles(id), workspace_owner_id uuid NOT NULL, license_number text, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','failed','missing','skipped','cancelled')), attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(batch_id,broker_id), CHECK(workspace_owner_id=broker_id));
GRANT SELECT ON public.broker_registry_batch_items TO authenticated; GRANT ALL ON public.broker_registry_batch_items TO service_role;
ALTER TABLE public.broker_registry_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY registry_item_admin_read ON public.broker_registry_batch_items FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()));
CREATE INDEX registry_pending_items ON public.broker_registry_batch_items(batch_id,next_attempt_at,id) WHERE status='pending';
ALTER TABLE public.broker_whatsapp_batches ADD COLUMN persistent boolean NOT NULL DEFAULT false;
ALTER TABLE public.broker_wa_scanner_jobs ADD COLUMN batch_id uuid REFERENCES public.broker_whatsapp_batches(id);
CREATE INDEX scanner_batch_jobs ON public.broker_wa_scanner_jobs(batch_id,broker_id);
CREATE FUNCTION public.start_broker_registry_batch(_actor uuid,_targets uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('broker_registry_batch'));
 SELECT id INTO b FROM public.broker_registry_batches WHERE status='running'; IF b IS NOT NULL THEN RETURN b; END IF;
 INSERT INTO public.broker_registry_batches(created_by) VALUES(_actor) RETURNING id INTO b;
 INSERT INTO public.broker_registry_batch_items(batch_id,broker_id,workspace_owner_id,license_number,status)
 SELECT b,p.id,p.id,COALESCE(NULLIF(btrim(p.broker_license_number),''),v.license_number,a.license_number,o.imported_license_number),CASE WHEN COALESCE(NULLIF(btrim(p.broker_license_number),''),v.license_number,a.license_number,o.imported_license_number) ~ '^[1-9][0-9]{0,9}$' THEN 'pending' ELSE 'missing' END
 FROM public.admin_broker_onboarding o JOIN public.profiles p ON p.id=o.user_id LEFT JOIN public.broker_license_verifications v ON v.user_id=p.id LEFT JOIN public.admin_approved_broker_licenses a ON a.user_id=p.id
 WHERE p.id=ANY(_targets) AND o.import_source IS NOT NULL AND o.first_invitation_at IS NULL AND o.first_login_at IS NULL AND NULLIF(p.locked_broker_name,'') IS NULL AND v.verified_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.id AND u.last_sign_in_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role::text IN('developer','marketing_company'))
 AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=p.id);
 UPDATE public.broker_registry_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM public.broker_registry_batch_items WHERE batch_id=b AND status='pending') THEN 'running' ELSE 'completed' END,lease_token=NULL WHERE id=b;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_registry_batch_start','broker_registry_batches',b::text,'{}');
 RETURN b;
END $$;
CREATE FUNCTION public.get_broker_registry_batch(_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.broker_registry_batches; result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.broker_registry_batches WHERE _id IS NULL OR id=_id ORDER BY (status='running') DESC,created_at DESC LIMIT 1;
 IF b.id IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('id',b.id,'status',b.status,'total',count(*),'done',count(*) FILTER(WHERE status<>'pending'),'verified',count(*) FILTER(WHERE status='verified')) INTO result FROM public.broker_registry_batch_items WHERE batch_id=b.id;
 RETURN result;
END $$;
CREATE FUNCTION public.cancel_broker_registry_batch(_id uuid,_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.broker_registry_batches WHERE id=_id FOR UPDATE;
 UPDATE public.broker_registry_batches SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=_id AND status='running';
 UPDATE public.broker_registry_batch_items SET status='cancelled',updated_at=now() WHERE batch_id=_id AND status='pending';
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_registry_batch_cancel','broker_registry_batches',_id::text,'{}');
END $$;
CREATE FUNCTION public.claim_broker_registry_batch(_id uuid) RETURNS SETOF public.broker_registry_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_registry_batches WHERE id=_id AND status='running' AND (NOT public.has_role(created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=created_by))) THEN
 UPDATE public.broker_registry_batches SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE id=_id; UPDATE public.broker_registry_batch_items SET status='cancelled' WHERE batch_id=_id AND status='pending'; RETURN;
 END IF;
 RETURN QUERY UPDATE public.broker_registry_batches SET lease_token=gen_random_uuid(),lease_until=now()+interval '180 seconds',updated_at=now() WHERE id=_id AND status='running' AND (lease_until IS NULL OR lease_until<now()) AND EXISTS(SELECT 1 FROM public.broker_registry_batch_items WHERE batch_id=_id AND status='pending' AND next_attempt_at<=now()) RETURNING *;
END $$;
CREATE FUNCTION public.finish_broker_registry_item(_batch uuid,_token uuid,_item uuid,_status text,_retry boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.broker_registry_batches WHERE id=_batch AND status='running' AND lease_token=_token AND lease_until>now() FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
 IF _status NOT IN('verified','failed','missing','skipped') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 UPDATE public.broker_registry_batch_items SET attempts=attempts+1,status=CASE WHEN _retry AND attempts<2 THEN 'pending' ELSE _status END,next_attempt_at=CASE WHEN _retry AND attempts<2 THEN now()+interval '60 seconds' ELSE now() END,updated_at=now() WHERE id=_item AND batch_id=_batch AND status='pending'; RETURN FOUND;
END $$;
CREATE FUNCTION public.release_broker_registry_batch(_id uuid,_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.broker_registry_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM public.broker_registry_batch_items WHERE batch_id=_id AND status='pending') THEN 'running' ELSE 'completed' END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=_id AND status='running' AND lease_token=_token;
END $$;
CREATE FUNCTION public.save_admin_registry_match(_actor uuid,_user uuid,_license text,_raw_name text,_display_name text,_city text,_source text,_source_updated text,_batch uuid DEFAULT NULL,_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; imported text; previous_name text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id IN(_actor,_user)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _license !~ '^[1-9][0-9]{0,9}$' OR length(btrim(_display_name))=0 OR _source IS DISTINCT FROM 'https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6' THEN RAISE EXCEPTION 'invalid_registry_record'; END IF;
 IF _batch IS NOT NULL THEN
 PERFORM 1 FROM public.broker_registry_batches WHERE id=_batch AND created_by=_actor AND status='running' AND lease_token=_token AND lease_until>now() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.broker_registry_batch_items WHERE batch_id=_batch AND broker_id=_user AND license_number=_license AND status='pending') THEN RAISE EXCEPTION 'cancelled_or_stale_batch' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_user AND import_source IS NOT NULL AND first_invitation_at IS NULL AND first_login_at IS NULL) OR EXISTS(SELECT 1 FROM auth.users WHERE id=_user AND last_sign_in_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role::text IN('developer','marketing_company')) THEN RAISE EXCEPTION 'target_no_longer_waiting' USING ERRCODE='40001'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('registry_license:'||_license));
 SELECT * INTO p FROM public.profiles WHERE id=_user FOR UPDATE;
 SELECT imported_license_number INTO imported FROM public.admin_broker_onboarding WHERE user_id=_user;
 IF p.id IS NULL OR COALESCE(NULLIF(p.broker_license_number,''),imported) IS DISTINCT FROM _license THEN RAISE EXCEPTION 'license_changed' USING ERRCODE='40001'; END IF;
 IF p.locked_broker_name IS NOT NULL AND (SELECT array_agg(w ORDER BY w) FROM unnest(string_to_array(p.locked_broker_name,' ')) w) IS DISTINCT FROM (SELECT array_agg(w ORDER BY w) FROM unnest(string_to_array(_display_name,' ')) w) THEN RAISE EXCEPTION 'locked_identity_conflict' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE broker_license_number=_license AND id<>_user) OR EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE imported_license_number=_license AND user_id<>_user) OR EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE license_number=_license AND user_id<>_user) OR EXISTS(SELECT 1 FROM public.broker_license_verifications WHERE license_number=_license AND user_id<>_user) THEN RAISE EXCEPTION 'license_owned' USING ERRCODE='40001'; END IF;
 INSERT INTO public.official_brokers_registry(license_number,holder_name,display_name,registry_city,source_url,source_updated_at,checked_at) VALUES(_license,_raw_name,_display_name,_city,_source,_source_updated,now()) ON CONFLICT(license_number) DO UPDATE SET holder_name=excluded.holder_name,display_name=excluded.display_name,registry_city=excluded.registry_city,source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,checked_at=excluded.checked_at;
 UPDATE public.profiles SET broker_license_number=_license,full_name=_display_name,locked_broker_name=_display_name,city=CASE WHEN NULLIF(_city,'') IS NULL THEN city ELSE _city END,locked_broker_city=CASE WHEN NULLIF(_city,'') IS NULL THEN locked_broker_city ELSE _city END WHERE id=_user;
 SELECT account_name_before_verification INTO previous_name FROM public.broker_license_verifications WHERE user_id=_user;
 INSERT INTO public.broker_license_verifications(user_id,license_number,registry_holder_name,account_name_before_verification,source_url,source_updated_at,verified_at) VALUES(_user,_license,_raw_name,COALESCE(previous_name,p.full_name,''),_source,_source_updated,now()) ON CONFLICT(user_id) DO UPDATE SET license_number=excluded.license_number,registry_holder_name=excluded.registry_holder_name,source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,verified_at=excluded.verified_at;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'admin_registry_name_refresh','profiles',_user::text,jsonb_build_object('source',_source,'batch_id',_batch));
 RETURN (SELECT jsonb_build_object('id',id,'full_name',full_name,'city',city,'broker_license_number',broker_license_number) FROM public.profiles WHERE id=_user);
END $$;
CREATE FUNCTION public.dispatch_broker_registry_batch(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.broker_registry_batches;
BEGIN
 SELECT * INTO b FROM public.broker_registry_batches WHERE id=_id;
 IF b.id IS NULL OR b.status<>'running' THEN RETURN; END IF;
 IF b.lease_until IS NULL OR b.lease_until<now() THEN PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/admin-broker-registry-batch',headers:=public.internal_call_headers(),body:=jsonb_build_object('action','step','batch_id',_id),timeout_milliseconds:=180000); END IF;
END $$;
CREATE FUNCTION public.wake_broker_registry_batch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n text:='broker-registry-batch-'||NEW.id::text;
BEGIN
 IF NEW.status='running' THEN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname=n) THEN PERFORM cron.schedule(n,'* * * * *',format('select public.dispatch_broker_registry_batch(%L)',NEW.id::text)); END IF;
 IF NEW.lease_token IS NULL AND EXISTS(SELECT 1 FROM public.broker_registry_batch_items WHERE batch_id=NEW.id AND status='pending' AND next_attempt_at<=now()) THEN PERFORM public.dispatch_broker_registry_batch(NEW.id); END IF;
 ELSIF EXISTS(SELECT 1 FROM cron.job WHERE jobname=n) THEN PERFORM cron.unschedule(n); END IF; RETURN NEW;
END $$;
CREATE TRIGGER registry_batch_wake AFTER INSERT OR UPDATE OF status,lease_token ON public.broker_registry_batches FOR EACH ROW EXECUTE FUNCTION public.wake_broker_registry_batch();
CREATE FUNCTION public.start_selected_broker_whatsapp_batch(_actor uuid,_brokers uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=_actor) OR cardinality(_brokers) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('broker_whatsapp_selected:'||_actor::text));
 SELECT id INTO b FROM public.broker_whatsapp_batches WHERE created_by=_actor AND status='running' LIMIT 1; IF b IS NOT NULL THEN RETURN b; END IF;
 INSERT INTO public.broker_whatsapp_batches(created_by,persistent) VALUES(_actor,true) RETURNING id INTO b;
 INSERT INTO public.broker_whatsapp_jobs(broker_id,workspace_owner_id,listing_id,source_url,created_by,batch_id)
 SELECT o.user_id,o.user_id,l.id,l.source_url,_actor,b FROM public.admin_broker_onboarding o
 JOIN LATERAL(SELECT id,source_url FROM public.listings WHERE user_id=o.user_id AND workspace_owner_id=o.user_id AND source='yad2' AND source_url ~ '^https://www\.yad2\.co\.il/realestate/item/[a-zA-Z0-9]+(\?.*)?$' ORDER BY created_at DESC,id LIMIT 1) l ON true
 WHERE o.user_id=ANY(_brokers) AND o.import_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=o.user_id AND role::text IN('developer','marketing_company'))
 AND (o.imported_license_number IS NOT NULL OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=o.user_id AND role::text IN('agent','lead_agent','managing_broker','junior_agent')))
 AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=o.user_id) AND NOT EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id=o.user_id)
 AND NOT EXISTS(SELECT 1 FROM public.broker_whatsapp_jobs WHERE broker_id=o.user_id AND status IN('pending','running','retry'))
 AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs WHERE broker_id=o.user_id AND status IN('pending_source','reading_source','ready','sending','awaiting_reply')) ON CONFLICT DO NOTHING;
 UPDATE public.broker_whatsapp_batches SET enqueue_finished=true,status=CASE WHEN EXISTS(SELECT 1 FROM public.broker_whatsapp_jobs WHERE batch_id=b) THEN 'running' ELSE 'completed' END,updated_at=now() WHERE id=b;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_actor,'broker_whatsapp_selected_batch_start','broker_whatsapp_batches',b::text,jsonb_build_object('selected',cardinality(_brokers))); RETURN b;
END $$;
CREATE FUNCTION public.guard_broker_scanner_batch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.batch_id IS NOT NULL THEN PERFORM 1 FROM public.broker_whatsapp_batches WHERE id=NEW.batch_id AND created_by=NEW.created_by AND status='running' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'whatsapp_batch_stopped' USING ERRCODE='40001'; END IF; END IF; RETURN NEW;
END $$;
CREATE TRIGGER scanner_batch_fence BEFORE INSERT ON public.broker_wa_scanner_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_broker_scanner_batch();
CREATE OR REPLACE FUNCTION public.cancel_broker_whatsapp_batch(_id uuid,_creator uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_creator,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=_creator) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.broker_whatsapp_batches WHERE id=_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'forbidden_batch' USING ERRCODE='42501'; END IF;
 UPDATE public.broker_whatsapp_batches SET status='stopped',updated_at=now() WHERE id=_id AND status='running';
 UPDATE public.broker_whatsapp_jobs SET status='failed',last_error='user_cancelled',lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE batch_id=_id AND status IN('pending','running','retry'); GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.broker_wa_scanner_jobs SET status='cancelled',last_error='user_cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE batch_id=_id AND status IN('pending_source','reading_source','ready','sending','awaiting_reply');
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(_creator,'broker_whatsapp_batch_cancel','broker_whatsapp_batches',_id::text,'{}'); RETURN n;
END $$;
CREATE FUNCTION public.get_broker_discovery_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 WITH sources AS(SELECT DISTINCT ON(broker_id) broker_id,status FROM public.broker_whatsapp_jobs ORDER BY broker_id,created_at DESC,id DESC), inquiries AS(SELECT DISTINCT ON(broker_id) broker_id,status FROM public.broker_wa_scanner_jobs ORDER BY broker_id,created_at DESC,id DESC)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('broker_id',COALESCE(s.broker_id,i.broker_id),'source_status',s.status,'scanner_status',i.status,'has_whatsapp',c.broker_id IS NOT NULL)), '[]'::jsonb) INTO rows FROM sources s FULL JOIN inquiries i ON i.broker_id=s.broker_id LEFT JOIN public.broker_whatsapp_contacts c ON c.broker_id=COALESCE(s.broker_id,i.broker_id);
 RETURN jsonb_build_object('rows',rows,'total',jsonb_array_length(rows),'done',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE COALESCE(r->>'source_status','') NOT IN('pending','running','retry') AND COALESCE(r->>'scanner_status','') NOT IN('pending_source','reading_source','ready','sending','awaiting_reply')));
END $$;
CREATE FUNCTION public.get_broker_whatsapp_batch_progress(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.broker_whatsapp_batches; total integer; done integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.broker_whatsapp_batches WHERE id=_id; IF b.id IS NULL THEN RETURN NULL; END IF;
 SELECT count(*),count(*) FILTER(WHERE j.status NOT IN('pending','running','retry') AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs s WHERE s.batch_id=j.batch_id AND s.broker_id=j.broker_id AND s.status IN('pending_source','reading_source','ready','sending','awaiting_reply')) AND NOT (b.persistent AND b.status='running' AND j.status='not_found' AND EXISTS(SELECT 1 FROM public.broker_wa_scanner_settings WHERE id AND enabled) AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs s WHERE s.batch_id=j.batch_id AND s.broker_id=j.broker_id))) INTO total,done FROM public.broker_whatsapp_jobs j WHERE j.batch_id=_id;
 IF b.status='running' AND b.enqueue_finished AND done=total THEN UPDATE public.broker_whatsapp_batches SET status='completed',updated_at=now() WHERE id=_id AND status='running'; b.status:='completed'; END IF;
 RETURN jsonb_build_object('id',b.id,'status',b.status,'done',done,'total',total);
END $$;
CREATE FUNCTION public.broker_whatsapp_batch_checkpoint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.batch_id IS NOT NULL THEN PERFORM public.get_broker_whatsapp_batch_progress(NEW.batch_id); END IF; RETURN NEW;
END $$;
CREATE TRIGGER discovery_batch_checkpoint AFTER UPDATE OF status ON public.broker_whatsapp_jobs FOR EACH ROW EXECUTE FUNCTION public.broker_whatsapp_batch_checkpoint();
CREATE TRIGGER scanner_batch_checkpoint AFTER UPDATE OF status ON public.broker_wa_scanner_jobs FOR EACH ROW EXECUTE FUNCTION public.broker_whatsapp_batch_checkpoint();
CREATE FUNCTION public.pending_broker_scanner_continuations() RETURNS SETOF public.broker_whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT j.* FROM public.broker_whatsapp_jobs j JOIN public.broker_whatsapp_batches b ON b.id=j.batch_id WHERE b.persistent AND b.status='running' AND j.status='not_found' AND public.has_role(j.created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id) AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs s WHERE s.batch_id=j.batch_id AND s.broker_id=j.broker_id) ORDER BY j.created_at,j.id LIMIT 10;
END $$;
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN('start_broker_registry_batch','get_broker_registry_batch','cancel_broker_registry_batch','claim_broker_registry_batch','finish_broker_registry_item','release_broker_registry_batch','save_admin_registry_match','dispatch_broker_registry_batch','wake_broker_registry_batch','start_selected_broker_whatsapp_batch','guard_broker_scanner_batch','get_broker_discovery_overview','get_broker_whatsapp_batch_progress','broker_whatsapp_batch_checkpoint','pending_broker_scanner_continuations') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END LOOP; END $$;
GRANT EXECUTE ON FUNCTION public.get_broker_registry_batch(uuid), public.get_broker_discovery_overview() TO authenticated;