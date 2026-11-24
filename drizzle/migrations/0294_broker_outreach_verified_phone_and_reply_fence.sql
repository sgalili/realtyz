ALTER TABLE public.broker_outreach_journeys ADD COLUMN otp_verified_phone text;
CREATE OR REPLACE FUNCTION public.record_broker_outreach_reply(_broker uuid,_message text,_kind text,_text text,_reply_to text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_outreach_journeys;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _kind NOT IN ('positive','opt_out') THEN RAISE EXCEPTION 'invalid_reply_kind'; END IF;
 SELECT * INTO j FROM public.broker_outreach_journeys WHERE broker_id=_broker FOR UPDATE;
 IF NOT FOUND OR NOT j.enabled OR j.outreach_message_id IS NULL OR j.opted_out_at IS NOT NULL OR (_reply_to IS NOT NULL AND _reply_to<>j.outreach_message_id) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.broker_outreach_events WHERE event_key='whatsapp:'||_message) THEN RETURN to_jsonb(j); END IF;
 INSERT INTO public.broker_outreach_events(broker_id,workspace_owner_id,event_key,kind,detail) VALUES(_broker,_broker,'whatsapp:'||_message,CASE WHEN _kind='opt_out' THEN 'opt_out' ELSE 'positive_reply' END,jsonb_build_object('text',left(_text,4000),'reply_to',_reply_to));
 UPDATE public.broker_outreach_journeys SET opted_out_at=CASE WHEN _kind='opt_out' THEN now() ELSE opted_out_at END,enabled=CASE WHEN _kind='opt_out' THEN false ELSE enabled END,cancel_requested_at=CASE WHEN _kind='opt_out' THEN now() ELSE cancel_requested_at END,stage=CASE WHEN _kind='opt_out' THEN 'opted_out' ELSE 'interested' END,interested_at=CASE WHEN _kind='positive' THEN COALESCE(interested_at,now()) ELSE interested_at END,voice_status=CASE WHEN _kind='positive' AND voice_status='not_requested' THEN 'pending' ELSE voice_status END,updated_at=now() WHERE broker_id=_broker RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.record_broker_outreach_reply(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_broker_outreach_reply(uuid,text,text,text,text) TO service_role;