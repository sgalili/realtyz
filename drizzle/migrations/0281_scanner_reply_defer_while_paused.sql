CREATE OR REPLACE FUNCTION public.complete_broker_wa_scanner_reply(_event uuid, _job uuid, _phone text, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
 IF NOT (e.quoted_id=j.provider_message_id OR position(j.source_url IN coalesce(e.reply_text,''))>0
   OR (public.scanner_reply_names_broker(e.reply_text,j.broker_id)
       AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs o WHERE o.id<>j.id AND o.status IN('sending','awaiting_reply')))) THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='missing_message_correlation' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','missing_message_correlation');
 END IF;
 IF s.instance_id IS DISTINCT FROM j.instance_id OR s.scanner_phone IS DISTINCT FROM j.scanner_phone THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='scanner_paused_or_reconfigured' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','scanner_paused_or_reconfigured');
 END IF;
 -- Same line but paused: keep the reply queued; the tick replays received events once the line is active again.
 IF NOT s.enabled OR s.paused THEN RETURN jsonb_build_object('ok',false,'reason','deferred_while_paused'); END IF;
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
END $function$;