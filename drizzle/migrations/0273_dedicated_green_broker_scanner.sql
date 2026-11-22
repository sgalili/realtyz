CREATE TABLE public.broker_wa_scanner_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false, paused boolean NOT NULL DEFAULT true,
 pause_reason text DEFAULT 'not_configured', daily_cap integer NOT NULL DEFAULT 15 CHECK(daily_cap BETWEEN 1 AND 50),
 jitter_min_seconds integer NOT NULL DEFAULT 45 CHECK(jitter_min_seconds BETWEEN 45 AND 600), jitter_max_seconds integer NOT NULL DEFAULT 180 CHECK(jitter_max_seconds BETWEEN jitter_min_seconds AND 600),
 start_hour integer NOT NULL DEFAULT 9 CHECK(start_hour BETWEEN 6 AND 20), end_hour integer NOT NULL DEFAULT 18 CHECK(end_hour BETWEEN start_hour+1 AND 22),
 error_threshold integer NOT NULL DEFAULT 3 CHECK(error_threshold BETWEEN 1 AND 5), send_errors integer NOT NULL DEFAULT 0, webhook_errors integer NOT NULL DEFAULT 0,
 instance_id text, scanner_phone text, connected boolean NOT NULL DEFAULT false, webhook_ready boolean NOT NULL DEFAULT false,
 config_checked_at timestamptz, worker_seen_at timestamptz, webhook_seen_at timestamptz, next_send_at timestamptz,
 budget_day date, day_attempts integer NOT NULL DEFAULT 0, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broker_wa_scanner_settings TO authenticated;
GRANT ALL ON public.broker_wa_scanner_settings TO service_role;
ALTER TABLE public.broker_wa_scanner_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY scanner_settings_super_admin_read ON public.broker_wa_scanner_settings FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.broker_wa_scanner_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), broker_id uuid NOT NULL REFERENCES public.profiles(id), workspace_owner_id uuid NOT NULL REFERENCES public.profiles(id),
 listing_id uuid NOT NULL REFERENCES public.listings(id), source_url text NOT NULL, created_by uuid NOT NULL, consent_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending_source' CHECK(status IN('pending_source','reading_source','ready','sending','awaiting_reply','completed','needs_manual','cancelled','failed')),
 source_attempts integer NOT NULL DEFAULT 0, next_source_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 target_phone text, prefilled_message text, instance_id text, scanner_phone text, send_token uuid, send_reserved_at timestamptz, provider_message_id text,
 reply_deadline timestamptz, completed_at timestamptz, last_error text, provider_status integer, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(broker_id,listing_id), CHECK(workspace_owner_id=broker_id)
);
GRANT SELECT ON public.broker_wa_scanner_jobs TO authenticated;
GRANT ALL ON public.broker_wa_scanner_jobs TO service_role;
ALTER TABLE public.broker_wa_scanner_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY scanner_jobs_super_admin_read ON public.broker_wa_scanner_jobs FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));
CREATE UNIQUE INDEX scanner_one_active_broker ON public.broker_wa_scanner_jobs(broker_id) WHERE status IN('pending_source','reading_source','ready','sending','awaiting_reply');
CREATE UNIQUE INDEX scanner_provider_message ON public.broker_wa_scanner_jobs(instance_id,provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX scanner_jobs_due ON public.broker_wa_scanner_jobs(status,next_source_at,created_at);

CREATE TABLE public.broker_wa_scanner_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id text NOT NULL, message_id text NOT NULL, event_type text NOT NULL,
 chat_id text, sender text, quoted_id text, reply_text text, event_at timestamptz, job_id uuid REFERENCES public.broker_wa_scanner_jobs(id), workspace_owner_id uuid,
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','completed','needs_manual','ignored')), reason text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(instance_id,message_id,event_type)
);
GRANT SELECT ON public.broker_wa_scanner_events TO authenticated;
GRANT ALL ON public.broker_wa_scanner_events TO service_role;
ALTER TABLE public.broker_wa_scanner_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY scanner_events_super_admin_read ON public.broker_wa_scanner_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));
CREATE INDEX scanner_events_pending ON public.broker_wa_scanner_events(status,created_at);

CREATE FUNCTION public.scanner_broker_eligible(_broker uuid,_listing uuid,_creator uuid,_source text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(_creator,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id IN(_creator,_broker))
 AND EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_broker AND import_source IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_broker AND role::text IN('developer','marketing_company'))
 AND EXISTS(SELECT 1 FROM public.listings WHERE id=_listing AND user_id=_broker AND workspace_owner_id=_broker AND source='yad2' AND source_url=_source)
 AND _source ~ '^https://www\.yad2\.co\.il/realestate/item/[a-zA-Z0-9]+(\?.*)?$'
$$;
REVOKE ALL ON FUNCTION public.scanner_broker_eligible(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_broker_eligible(uuid,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.claim_broker_wa_scanner_source() RETURNS SETOF public.broker_wa_scanner_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_wa_scanner_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.broker_wa_scanner_jobs SET status=CASE WHEN source_attempts<3 THEN 'pending_source' ELSE 'needs_manual' END,lease_token=NULL,lease_until=NULL,last_error='source_lease_expired',next_source_at=now()+interval '120 seconds',updated_at=now() WHERE status='reading_source' AND lease_until<now();
 IF NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_settings WHERE id AND enabled AND NOT paused) THEN RETURN; END IF;
 SELECT * INTO j FROM public.broker_wa_scanner_jobs WHERE status='pending_source' AND source_attempts<3 AND next_source_at<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT public.scanner_broker_eligible(j.broker_id,j.listing_id,j.created_by,j.source_url) OR EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id) THEN
  UPDATE public.broker_wa_scanner_jobs SET status='cancelled',last_error='ineligible_or_contact_saved',updated_at=now() WHERE id=j.id; RETURN;
 END IF;
 RETURN QUERY UPDATE public.broker_wa_scanner_jobs SET status='reading_source',source_attempts=source_attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_broker_wa_scanner_source() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_wa_scanner_source() TO service_role;

CREATE FUNCTION public.reserve_broker_wa_scanner_send(_instance text,_phone text,_jitter integer) RETURNS SETOF public.broker_wa_scanner_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.broker_wa_scanner_settings; j public.broker_wa_scanner_jobs; local_now timestamp; today date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.broker_wa_scanner_settings WHERE id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error=CASE WHEN status='sending' THEN 'send_outcome_unknown_no_resend' ELSE 'reply_timeout' END,updated_at=now() WHERE (status='sending' AND send_reserved_at<now()-interval '90 seconds') OR (status='awaiting_reply' AND reply_deadline<now());
 IF NOT s.enabled OR s.paused OR NOT s.connected OR NOT s.webhook_ready OR s.instance_id IS DISTINCT FROM _instance OR s.scanner_phone IS DISTINCT FROM _phone OR s.config_checked_at IS NULL OR s.config_checked_at<now()-interval '5 minutes' THEN RETURN; END IF;
 IF _jitter NOT BETWEEN s.jitter_min_seconds AND s.jitter_max_seconds THEN RAISE EXCEPTION 'invalid_jitter'; END IF;
 local_now:=now() AT TIME ZONE 'Asia/Jerusalem'; today:=local_now::date;
 IF extract(hour FROM local_now)<s.start_hour OR extract(hour FROM local_now)>=s.end_hour OR s.next_send_at>now() THEN RETURN; END IF;
 IF s.budget_day IS DISTINCT FROM today THEN UPDATE public.broker_wa_scanner_settings SET budget_day=today,day_attempts=0 WHERE id; s.day_attempts:=0; END IF;
 IF s.day_attempts>=s.daily_cap THEN RETURN; END IF;
 -- One outstanding service-chat inquiry: never create a high-volume shared-chat burst.
 IF EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs WHERE status IN('sending','awaiting_reply')) THEN RETURN; END IF;
 SELECT * INTO j FROM public.broker_wa_scanner_jobs WHERE status='ready' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT public.scanner_broker_eligible(j.broker_id,j.listing_id,j.created_by,j.source_url) OR EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id) THEN
  UPDATE public.broker_wa_scanner_jobs SET status='cancelled',last_error='ineligible_or_contact_saved',updated_at=now() WHERE id=j.id; RETURN;
 END IF;
 IF j.target_phone IS DISTINCT FROM '972559895695' OR length(j.prefilled_message) NOT BETWEEN 1 AND 4000 THEN
  UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error='invalid_prefilled_action',updated_at=now() WHERE id=j.id; RETURN;
 END IF;
 UPDATE public.broker_wa_scanner_settings SET day_attempts=day_attempts+1,next_send_at=now()+make_interval(secs=>_jitter),updated_at=now() WHERE id;
 RETURN QUERY UPDATE public.broker_wa_scanner_jobs SET status='sending',instance_id=_instance,scanner_phone=_phone,send_token=gen_random_uuid(),send_reserved_at=now(),reply_deadline=now()+interval '24 hours',updated_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.reserve_broker_wa_scanner_send(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_broker_wa_scanner_send(text,text,integer) TO service_role;

CREATE FUNCTION public.record_broker_wa_scanner_error(_kind text,_reason text,_immediate boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _kind NOT IN('send','webhook') THEN RAISE EXCEPTION 'invalid_error_kind'; END IF;
 UPDATE public.broker_wa_scanner_settings SET send_errors=send_errors+CASE WHEN _kind='send' THEN 1 ELSE 0 END,webhook_errors=webhook_errors+CASE WHEN _kind='webhook' THEN 1 ELSE 0 END,
 paused=paused OR _immediate OR (send_errors+CASE WHEN _kind='send' THEN 1 ELSE 0 END)>=error_threshold OR (webhook_errors+CASE WHEN _kind='webhook' THEN 1 ELSE 0 END)>=error_threshold,
 pause_reason=CASE WHEN _immediate OR (send_errors+CASE WHEN _kind='send' THEN 1 ELSE 0 END)>=error_threshold OR (webhook_errors+CASE WHEN _kind='webhook' THEN 1 ELSE 0 END)>=error_threshold THEN left(_reason,300) ELSE pause_reason END,updated_at=now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.record_broker_wa_scanner_error(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_broker_wa_scanner_error(text,text,boolean) TO service_role;

CREATE FUNCTION public.complete_broker_wa_scanner_reply(_event uuid,_job uuid,_phone text,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.broker_wa_scanner_events; j public.broker_wa_scanner_jobs; existing text; final_status text; s public.broker_wa_scanner_settings;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.broker_wa_scanner_settings WHERE id FOR UPDATE;
 SELECT * INTO e FROM public.broker_wa_scanner_events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.status<>'received' THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 SELECT * INTO j FROM public.broker_wa_scanner_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'awaiting_reply' OR j.instance_id IS DISTINCT FROM e.instance_id OR e.chat_id IS DISTINCT FROM j.target_phone||'@c.us' OR e.sender IS DISTINCT FROM e.chat_id OR e.event_at<j.send_reserved_at-interval '5 seconds' OR e.event_at>j.reply_deadline OR NOT public.scanner_broker_eligible(j.broker_id,j.listing_id,j.created_by,j.source_url) THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='untrusted_or_stale_correlation' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','untrusted_or_stale_correlation');
 END IF;
 -- A body name or latest pending job is not evidence. Require an exact quoted provider ID or full saved ad URL in the reply.
 IF NOT (e.quoted_id=j.provider_message_id OR position(j.source_url IN coalesce(e.reply_text,''))>0) THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='missing_message_correlation' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','missing_message_correlation');
 END IF;
 IF NOT s.enabled OR s.paused OR s.instance_id IS DISTINCT FROM j.instance_id OR s.scanner_phone IS DISTINCT FROM j.scanner_phone THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='scanner_paused_or_reconfigured' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','scanner_paused_or_reconfigured');
 END IF;
 final_status:='needs_manual';
 IF _phone IS NOT NULL THEN
  IF _phone !~ '^9725[0-9]{8}$' OR _phone IN('972559895695','972537983832',j.scanner_phone,j.target_phone) THEN RAISE EXCEPTION 'invalid_personal_number'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('broker_whatsapp_phone:'||_phone));
  IF EXISTS(SELECT 1 FROM public.broker_whatsapp_shared_numbers WHERE whatsapp_phone=_phone) OR EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE whatsapp_phone=_phone AND broker_id<>j.broker_id) THEN
   _reason:='shared_whatsapp_number';
   INSERT INTO public.broker_whatsapp_shared_numbers(whatsapp_phone,reason) VALUES(_phone,'seen_for_multiple_brokers') ON CONFLICT DO NOTHING;
   DELETE FROM public.broker_whatsapp_contacts WHERE whatsapp_phone=_phone AND source_url<>'manual';
  ELSE
   INSERT INTO public.broker_whatsapp_contacts(broker_id,workspace_owner_id,whatsapp_phone,whatsapp_link,source_url) VALUES(j.broker_id,j.workspace_owner_id,_phone,'https://wa.me/'||_phone,j.source_url) ON CONFLICT(broker_id) DO NOTHING;
   SELECT whatsapp_phone INTO existing FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id AND workspace_owner_id=j.workspace_owner_id FOR UPDATE;
   IF existing=_phone THEN final_status:='completed'; _reason:='verified_reply_saved'; ELSE _reason:='manual_contact_preserved'; END IF;
  END IF;
 END IF;
 UPDATE public.broker_wa_scanner_jobs SET status=final_status,last_error=CASE WHEN final_status='completed' THEN NULL ELSE left(_reason,300) END,completed_at=CASE WHEN final_status='completed' THEN now() ELSE NULL END,updated_at=now() WHERE id=j.id;
 UPDATE public.broker_wa_scanner_events SET status=final_status,reason=left(_reason,300),job_id=j.id,workspace_owner_id=j.workspace_owner_id WHERE id=e.id;
 IF final_status='completed' THEN INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(j.created_by,'super_admin.broker_wa_scanner_saved','broker_whatsapp_contacts',j.broker_id,jsonb_build_object('scanner_job',j.id,'reply_event',e.id)); END IF;
 RETURN jsonb_build_object('ok',true,'status',final_status);
END $$;
REVOKE ALL ON FUNCTION public.complete_broker_wa_scanner_reply(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_broker_wa_scanner_reply(uuid,uuid,text,text) TO service_role;
COMMENT ON TABLE public.broker_wa_scanner_settings IS 'Global operational scanner controls; dedicated Green API only, separate from official messaging and existing discovery.';
COMMENT ON TABLE public.broker_wa_scanner_jobs IS 'Explicitly approved inquiries only. Unknown send outcomes never retry. Personal numbers save only after authenticated exact message/source correlation.';