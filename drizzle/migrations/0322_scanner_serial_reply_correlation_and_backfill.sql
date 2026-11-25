CREATE OR REPLACE FUNCTION public.scanner_reply_names_broker_flexible(_text text, _broker uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT EXISTS(SELECT 1 FROM unnest(public.broker_name_tokens(p.full_name)) x
     WHERE length(x)>=3 AND position(x IN lower(coalesce(_text,'')))>0)
   FROM public.profiles p WHERE p.id=_broker),false)
$$;
REVOKE ALL ON FUNCTION public.scanner_reply_names_broker_flexible(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_reply_names_broker_flexible(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.scanner_reply_phone(_text text, _excluded text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (
    SELECT DISTINCT CASE WHEN d ~ '^05[0-9]{8}$' THEN '972'||substr(d,2) ELSE d END p
    FROM (SELECT (regexp_matches(coalesce(_text,''),'(?:wa\.me/|phone=)\+?([0-9]{10,12})','g'))[1] d) s
  )
  SELECT CASE WHEN count(*)=1 THEN min(p) END FROM c
  WHERE p ~ '^9725[0-9]{8}$' AND NOT (p = ANY(_excluded || ARRAY['972559895695','972537983832']))
$$;

CREATE OR REPLACE FUNCTION public.complete_broker_wa_scanner_reply(_event uuid, _job uuid, _phone text, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e public.broker_wa_scanner_events; j public.broker_wa_scanner_jobs; existing text; final_status text; s public.broker_wa_scanner_settings; serial_ok boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.broker_wa_scanner_settings WHERE id FOR UPDATE;
 SELECT * INTO e FROM public.broker_wa_scanner_events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.status<>'received' THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 SELECT * INTO j FROM public.broker_wa_scanner_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'awaiting_reply' OR j.instance_id IS DISTINCT FROM e.instance_id OR e.chat_id IS DISTINCT FROM j.target_phone||'@c.us' OR e.sender IS DISTINCT FROM e.chat_id OR e.event_at<j.send_reserved_at-interval '5 seconds' OR e.event_at>j.reply_deadline OR NOT public.scanner_broker_eligible(j.broker_id,j.listing_id,j.created_by,j.source_url) THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='untrusted_or_stale_correlation' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','untrusted_or_stale_correlation');
 END IF;
 -- Serial line: a reply within 2 minutes of the only outstanding inquiry on this line belongs to it.
 serial_ok := e.event_at <= j.send_reserved_at + interval '120 seconds'
   AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs o WHERE o.id<>j.id AND o.status IN('sending','awaiting_reply') AND o.instance_id=j.instance_id AND o.target_phone=j.target_phone);
 IF NOT (e.quoted_id=j.provider_message_id OR position(j.source_url IN coalesce(e.reply_text,''))>0 OR serial_ok
   OR (public.scanner_reply_names_broker_flexible(e.reply_text,j.broker_id)
       AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs o WHERE o.id<>j.id AND o.status='awaiting_reply' AND o.instance_id=j.instance_id AND o.target_phone=j.target_phone AND public.scanner_reply_names_broker_flexible(e.reply_text,o.broker_id)))) THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='missing_message_correlation',job_id=j.id,workspace_owner_id=j.workspace_owner_id WHERE id=e.id;
  -- Release the serial line now instead of waiting for the reply deadline.
  UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error='reply_uncorrelated',updated_at=now() WHERE id=j.id AND status='awaiting_reply';
  RETURN jsonb_build_object('ok',false,'reason','missing_message_correlation');
 END IF;
 IF s.instance_id IS DISTINCT FROM j.instance_id OR s.scanner_phone IS DISTINCT FROM j.scanner_phone THEN
  UPDATE public.broker_wa_scanner_events SET status='needs_manual',reason='scanner_paused_or_reconfigured' WHERE id=e.id; RETURN jsonb_build_object('ok',false,'reason','scanner_paused_or_reconfigured');
 END IF;
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

CREATE OR REPLACE FUNCTION public.backfill_broker_wa_scanner_needs_manual()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; ph text; existing text; saved int:=0; shared int:=0; kept int:=0; nophone int:=0;
BEGIN
 FOR r IN
  SELECT e.id eid, j.* FROM public.broker_wa_scanner_events e
  CROSS JOIN LATERAL (SELECT * FROM public.broker_wa_scanner_jobs j WHERE j.instance_id=e.instance_id AND e.chat_id=j.target_phone||'@c.us'
     AND j.send_reserved_at<=e.event_at+interval '5 seconds' ORDER BY j.send_reserved_at DESC LIMIT 1) j
  WHERE e.status='needs_manual' AND e.chat_id='972559895695@c.us' AND e.sender=e.chat_id
    AND e.event_at<=j.send_reserved_at+interval '120 seconds' AND j.status IN('needs_manual','awaiting_reply')
  ORDER BY e.event_at
 LOOP
  SELECT reply_text INTO existing FROM public.broker_wa_scanner_events WHERE id=r.eid;
  ph := public.scanner_reply_phone(existing, ARRAY[coalesce(r.scanner_phone,''),coalesce(r.target_phone,'')]);
  IF ph IS NULL THEN nophone:=nophone+1; CONTINUE; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('broker_whatsapp_phone:'||ph));
  IF EXISTS(SELECT 1 FROM public.broker_whatsapp_shared_numbers WHERE whatsapp_phone=ph) OR EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE whatsapp_phone=ph AND broker_id<>r.broker_id) THEN
   INSERT INTO public.broker_whatsapp_shared_numbers(whatsapp_phone,reason) VALUES(ph,'seen_for_multiple_brokers') ON CONFLICT DO NOTHING;
   DELETE FROM public.broker_whatsapp_contacts WHERE whatsapp_phone=ph AND source_url<>'manual';
   UPDATE public.broker_wa_scanner_events SET reason='shared_whatsapp_number',job_id=r.id WHERE id=r.eid;
   UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error='shared_whatsapp_number',updated_at=now() WHERE id=r.id;
   shared:=shared+1; CONTINUE;
  END IF;
  INSERT INTO public.broker_whatsapp_contacts(broker_id,workspace_owner_id,whatsapp_phone,whatsapp_link,source_url) VALUES(r.broker_id,r.workspace_owner_id,ph,'https://wa.me/'||ph,r.source_url) ON CONFLICT(broker_id) DO NOTHING;
  SELECT whatsapp_phone INTO existing FROM public.broker_whatsapp_contacts WHERE broker_id=r.broker_id;
  IF existing=ph THEN
   UPDATE public.broker_wa_scanner_jobs SET status='completed',last_error=NULL,completed_at=now(),updated_at=now() WHERE id=r.id;
   UPDATE public.broker_wa_scanner_events SET status='completed',reason='backfill_serial_reply_saved',job_id=r.id,workspace_owner_id=r.workspace_owner_id WHERE id=r.eid;
   INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(r.created_by,'super_admin.broker_wa_scanner_saved','broker_whatsapp_contacts',r.broker_id,jsonb_build_object('scanner_job',r.id,'reply_event',r.eid,'backfill',true));
   saved:=saved+1;
  ELSE
   UPDATE public.broker_wa_scanner_jobs SET status='needs_manual',last_error='manual_contact_preserved',updated_at=now() WHERE id=r.id AND status='awaiting_reply';
   kept:=kept+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('saved',saved,'shared',shared,'existing_preserved',kept,'no_phone',nophone);
END $$;
REVOKE ALL ON FUNCTION public.backfill_broker_wa_scanner_needs_manual() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_broker_wa_scanner_needs_manual() TO service_role;