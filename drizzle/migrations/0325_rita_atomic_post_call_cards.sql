CREATE OR REPLACE FUNCTION public.rita_normalize_phone(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE d text := regexp_replace(coalesce(_raw,''), '[^0-9]', '', 'g');
BEGIN
 IF left(d,2)='00' THEN d:=substr(d,3); END IF;
 IF left(d,3)='972' THEN d:='0'||substr(d,4); END IF;
 IF left(d,1)<>'0' THEN d:='0'||d; END IF;
 IF d ~ '^0[57][0-9]{8}$' OR d ~ '^0[2-489][0-9]{6,7}$' THEN RETURN '972'||substr(d,2); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.rita_normalize_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rita_normalize_phone(text) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS leads_workspace_rita_phone_idx ON public.leads(workspace_owner_id,public.rita_normalize_phone(phone_number));

CREATE OR REPLACE FUNCTION public.sync_rita_post_call(_context_id uuid,_conversation_id text,_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 c public.rita_call_contexts%ROWTYPE; l public.leads%ROWTYPE; role_name text; normalized text;
 lead_id_value uuid; profile_id_value uuid; call_id_value uuid; existing_owner uuid;
 started timestamptz; ended timestamptz; duration integer; callback boolean;
 summary_value text; compact jsonb; prefs jsonb; prior_started timestamptz; recipient uuid;
BEGIN
 IF length(_conversation_id) NOT BETWEEN 1 AND 160 OR jsonb_typeof(_result)<>'object' THEN RAISE EXCEPTION 'Invalid post-call data'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rita-conversation:'||_conversation_id,0));
 SELECT * INTO c FROM public.rita_call_contexts WHERE id=_context_id FOR UPDATE;
 IF c.id IS NULL OR (c.conversation_id IS NOT NULL AND c.conversation_id<>_conversation_id) THEN RAISE EXCEPTION 'Call context mismatch'; END IF;
 IF c.source_context->>'post_call_synced'=_conversation_id THEN
  SELECT id INTO call_id_value FROM public.call_records WHERE elevenlabs_conversation_id=_conversation_id;
  RETURN jsonb_build_object('received',true,'duplicate',true,'conversation_id',_conversation_id,'lead_id',c.lead_id,'call_record_id',call_id_value);
 END IF;
 role_name:=coalesce(c.dynamic_variables->>'call_role',CASE WHEN c.lead_id IS NOT NULL THEN 'property_lead' ELSE 'general_inbound' END);
 IF role_name NOT IN ('property_lead','broker_invite','broker_support','general_inbound') THEN RAISE EXCEPTION 'Invalid call role'; END IF;
 normalized:=public.rita_normalize_phone(coalesce(nullif(c.lead_phone,''),_result->>'caller_phone'));
 started:=coalesce(nullif(_result->>'started_at','')::timestamptz,c.created_at);
 duration:=least(86400,greatest(0,coalesce((_result->>'duration_seconds')::integer,0)));
 ended:=started+make_interval(secs=>duration);
 callback:=coalesce((_result->>'needs_callback')::boolean,false);
 summary_value:=left(coalesce(_result->>'summary',''),20000);
 compact:=(_result->'compact')||jsonb_build_object('conversation_id',_conversation_id,'started_at',started,'direction',c.direction,'duration_seconds',duration,'call_role',role_name);
 IF c.workspace_owner_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('rita-contact:'||c.workspace_owner_id::text||':'||coalesce(normalized,c.lead_id::text,'unknown'),0));
  IF role_name IN ('broker_invite','broker_support') THEN
   SELECT id INTO profile_id_value FROM public.profiles WHERE id=c.workspace_owner_id;
   IF profile_id_value IS NULL THEN RAISE EXCEPTION 'Broker profile unavailable'; END IF;
  ELSE
   IF c.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.leads WHERE id=c.lead_id AND workspace_owner_id=c.workspace_owner_id FOR UPDATE;
    IF l.id IS NULL THEN RAISE EXCEPTION 'Lead workspace mismatch'; END IF;
   ELSIF normalized IS NOT NULL THEN
    SELECT * INTO l FROM public.leads WHERE workspace_owner_id=c.workspace_owner_id AND public.rita_normalize_phone(phone_number)=normalized
     ORDER BY last_interaction_at DESC NULLS LAST,created_at,id LIMIT 1 FOR UPDATE;
   END IF;
   lead_id_value:=l.id;
   IF lead_id_value IS NULL AND role_name='general_inbound' THEN
    SELECT id INTO profile_id_value FROM public.profiles WHERE id=c.workspace_owner_id AND public.rita_normalize_phone(phone)=normalized;
   END IF;
   IF lead_id_value IS NULL AND profile_id_value IS NULL AND normalized IS NOT NULL THEN
    INSERT INTO public.leads(workspace_owner_id,full_name,phone_number,city,deal_type,linked_listing_id,lead_stage,status,last_interaction_at)
    VALUES(c.workspace_owner_id,coalesce(nullif(_result->>'full_name',''),nullif(c.full_name,''),'מתקשר ללא שם'),normalized,nullif(c.property_context->>'city',''),
     CASE WHEN c.property_context->>'deal_type'='rent' THEN 'rent' ELSE 'sale' END,c.property_id,'new_lead','new',started)
    RETURNING * INTO l;
    lead_id_value:=l.id;
   END IF;
  END IF;
  SELECT id,user_id INTO call_id_value,existing_owner FROM public.call_records WHERE elevenlabs_conversation_id=_conversation_id FOR UPDATE;
  IF existing_owner IS NOT NULL AND existing_owner<>c.workspace_owner_id THEN RAISE EXCEPTION 'Call workspace mismatch'; END IF;
  INSERT INTO public.call_records(user_id,lead_id,elevenlabs_conversation_id,caller_phone,direction,handled_by,status,duration_seconds,transcript,transcript_text,summary,needs_callback,callback_reason,started_at,ended_at,metadata)
  VALUES(c.workspace_owner_id,lead_id_value,_conversation_id,coalesce(nullif(c.lead_phone,''),_result->>'caller_phone'),c.direction,'ai',CASE WHEN callback THEN 'escalated' ELSE 'completed' END,
   duration,coalesce(_result->'transcript','[]'::jsonb),left(coalesce(_result->>'transcript_text',''),100000),summary_value,callback,CASE WHEN callback THEN 'התבקשה חזרה אנושית' END,started,ended,
   jsonb_build_object('provider','elevenlabs','call_role',role_name,'profile_id',profile_id_value,'rita_call_context_id',c.id,'listing_id',c.property_id,'qualification',_result->'qualification',
    'matched_property_ids',_result->'matched_property_ids','source',c.source,'rita_summary',compact))
  ON CONFLICT(elevenlabs_conversation_id) WHERE elevenlabs_conversation_id IS NOT NULL DO UPDATE SET
   lead_id=EXCLUDED.lead_id,caller_phone=EXCLUDED.caller_phone,direction=EXCLUDED.direction,handled_by=EXCLUDED.handled_by,status=EXCLUDED.status,
   duration_seconds=EXCLUDED.duration_seconds,transcript=EXCLUDED.transcript,transcript_text=EXCLUDED.transcript_text,summary=EXCLUDED.summary,
   needs_callback=EXCLUDED.needs_callback,callback_reason=EXCLUDED.callback_reason,started_at=EXCLUDED.started_at,ended_at=EXCLUDED.ended_at,
   metadata=coalesce(public.call_records.metadata,'{}'::jsonb)||EXCLUDED.metadata
  RETURNING id INTO call_id_value;
  compact:=compact||jsonb_build_object('call_record_id',call_id_value);
  UPDATE public.call_records SET metadata=jsonb_set(metadata,'{rita_summary}',compact) WHERE id=call_id_value;
  IF lead_id_value IS NOT NULL THEN
   prefs:=coalesce(l.preferences,'{}'::jsonb);
   BEGIN prior_started:=(prefs#>>'{rita_last_call,started_at}')::timestamptz; EXCEPTION WHEN OTHERS THEN prior_started:=NULL; END;
   UPDATE public.leads SET
    full_name=CASE WHEN (full_name IS NULL OR btrim(full_name)='' OR full_name='מתקשר ללא שם') AND nullif(_result->>'full_name','') IS NOT NULL THEN _result->>'full_name' ELSE full_name END,
    last_interaction_at=greatest(last_interaction_at,started),
    preferences=CASE WHEN prior_started IS NULL OR prior_started<=started THEN prefs||jsonb_build_object('voice_qualification',_result->'qualification','matched_property_ids',_result->'matched_property_ids',
     'last_voice_conversation_id',_conversation_id,'last_call_summary',summary_value,'rita_last_call',compact)||CASE WHEN c.property_id IS NOT NULL THEN jsonb_build_object('source_property_id',c.property_id) ELSE '{}'::jsonb END ELSE prefs END
    WHERE id=lead_id_value AND workspace_owner_id=c.workspace_owner_id;
   IF NOT EXISTS(SELECT 1 FROM public.messages WHERE lead_id=lead_id_value AND metadata->>'conversation_id'=_conversation_id) THEN
    INSERT INTO public.messages(lead_id,direction,sender_type,platform,channel,content,metadata)
    VALUES(lead_id_value,c.direction,'ai','whatsapp','voice','סיכום שיחת ריטה'||E'\n'||summary_value,jsonb_build_object('source','ai_voice_call','conversation_id',_conversation_id,
     'external_id','rita-call:'||_conversation_id,'qualification',_result->'qualification','matched_property_ids',_result->'matched_property_ids','rita_call_context_id',c.id))
    ON CONFLICT ((metadata->>'external_id')) WHERE metadata->>'external_id' IS NOT NULL DO NOTHING;
   END IF;
  END IF;
  IF role_name='broker_invite' THEN
   UPDATE public.broker_outreach_journeys SET call_status='completed',last_error=NULL WHERE broker_id=c.workspace_owner_id AND call_provider_id=_conversation_id;
   INSERT INTO public.broker_outreach_events(broker_id,workspace_owner_id,event_key,kind,detail)
    VALUES(c.workspace_owner_id,c.workspace_owner_id,'rita-call:'||_conversation_id,'call_status',jsonb_build_object('provider','elevenlabs','status','completed','summary',summary_value,'call_role',role_name,'call_record_id',call_id_value))
    ON CONFLICT(event_key) DO UPDATE SET detail=EXCLUDED.detail;
  END IF;
 END IF;
 UPDATE public.rita_call_contexts SET conversation_id=_conversation_id,lead_id=lead_id_value,
  full_name=coalesce(nullif(c.full_name,''),nullif(_result->>'full_name','')),lead_phone=coalesce(nullif(c.lead_phone,''),_result->>'caller_phone'),
  status=CASE WHEN callback THEN 'escalated' ELSE 'completed' END,qualification=_result->'qualification',matched_property_ids=_result->'matched_property_ids',
  transcript_summary=summary_value,source_context=coalesce(source_context,'{}'::jsonb)||jsonb_build_object('post_call_synced',_conversation_id,'call_record_id',call_id_value,'profile_id',profile_id_value,'unassigned',workspace_owner_id IS NULL),updated_at=now()
  WHERE id=c.id;
 IF c.workspace_owner_id IS NOT NULL THEN
  FOR recipient IN SELECT c.workspace_owner_id UNION SELECT user_id FROM public.workspace_memberships WHERE workspace_owner_id=c.workspace_owner_id UNION SELECT user_id FROM public.user_roles WHERE role='super_admin' LOOP
   BEGIN PERFORM realtime.send('{}'::jsonb,'call-completed','rita-calls:'||recipient::text,true); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('received',true,'duplicate',false,'conversation_id',_conversation_id,'lead_id',lead_id_value,'profile_id',profile_id_value,'call_record_id',call_id_value,'unassigned',c.workspace_owner_id IS NULL,'qualification',_result->'qualification','matched_property_ids',_result->'matched_property_ids');
END $$;
REVOKE ALL ON FUNCTION public.sync_rita_post_call(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_rita_post_call(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.rita_latest_profile_calls()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'summary',r.metadata->'rita_summary') ORDER BY r.started_at DESC),'[]'::jsonb)
 FROM (SELECT DISTINCT ON (user_id) user_id,metadata,started_at FROM public.call_records WHERE lead_id IS NULL AND metadata->>'provider'='elevenlabs' AND metadata->'rita_summary' IS NOT NULL AND status IN ('completed','escalated') ORDER BY user_id,started_at DESC,id DESC LIMIT 1000)r;
$$;
REVOKE ALL ON FUNCTION public.rita_latest_profile_calls() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rita_latest_profile_calls() TO authenticated,service_role;

CREATE POLICY rita_private_call_topic_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
USING (realtime.topic() NOT LIKE 'rita-calls:%' OR realtime.topic()='rita-calls:'||(SELECT auth.uid())::text);