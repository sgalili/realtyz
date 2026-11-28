CREATE TABLE public.rita_whatsapp_link_sends (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), context_id uuid NOT NULL REFERENCES public.rita_call_contexts(id) ON DELETE CASCADE, workspace_owner_id uuid NOT NULL, dedupe_key text NOT NULL UNIQUE, property_ids uuid[] NOT NULL, phone_number text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','accepted','sent','delivered','read','failed','unknown')), provider_message_id text UNIQUE, error text, status_history jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.rita_whatsapp_link_sends TO service_role;
ALTER TABLE public.rita_whatsapp_link_sends ENABLE ROW LEVEL SECURITY;
CREATE INDEX rita_whatsapp_sends_context_idx ON public.rita_whatsapp_link_sends(context_id,created_at DESC);
CREATE TABLE public.rita_whatsapp_status_inbox (delivery_id text PRIMARY KEY, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, processing_error text);
GRANT ALL ON public.rita_whatsapp_status_inbox TO service_role;
ALTER TABLE public.rita_whatsapp_status_inbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX rita_whatsapp_status_pending_idx ON public.rita_whatsapp_status_inbox(received_at) WHERE processed_at IS NULL;
CREATE OR REPLACE FUNCTION public.reconcile_rita_whatsapp_statuses() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE evt record; st jsonb; msg public.rita_whatsapp_link_sends; n integer:=0; all_done boolean; event_time timestamptz; state text; rank_old integer; rank_new integer;
BEGIN
 FOR evt IN SELECT i.* FROM public.rita_whatsapp_status_inbox i WHERE i.processed_at IS NULL AND (NOT jsonb_path_exists(i.payload,'$.entry[*].changes[*].value.statuses[*]') OR EXISTS (SELECT 1 FROM jsonb_path_query(i.payload,'$.entry[*].changes[*].value.statuses[*]') s WHERE EXISTS (SELECT 1 FROM public.rita_whatsapp_link_sends x WHERE x.provider_message_id=s->>'id'))) ORDER BY i.received_at LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
  all_done:=true;
  FOR st IN SELECT * FROM jsonb_path_query(evt.payload,'$.entry[*].changes[*].value.statuses[*]') LOOP
   SELECT * INTO msg FROM public.rita_whatsapp_link_sends WHERE provider_message_id=st->>'id' FOR UPDATE;
   IF NOT FOUND THEN all_done:=false; CONTINUE; END IF;
   state:=st->>'status';
   IF state NOT IN ('sent','delivered','read','failed') THEN CONTINUE; END IF;
   event_time:=CASE WHEN (st->>'timestamp') ~ '^[0-9]{1,11}$' THEN to_timestamp((st->>'timestamp')::bigint) ELSE NULL END;
   rank_old:=CASE msg.status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END;
   rank_new:=CASE state WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END;
   UPDATE public.rita_whatsapp_link_sends SET status=CASE WHEN rank_new>=rank_old THEN state ELSE status END, status_history=CASE WHEN status_history @> jsonb_build_array(jsonb_build_object('delivery_id',evt.delivery_id,'status',state)) THEN status_history ELSE status_history||jsonb_build_array(jsonb_build_object('delivery_id',evt.delivery_id,'status',state,'provider_timestamp',event_time,'errors',st->'errors')) END, error=CASE WHEN state='failed' THEN (st->'errors')::text ELSE error END,updated_at=now() WHERE id=msg.id;
  END LOOP;
  IF all_done THEN UPDATE public.rita_whatsapp_status_inbox SET processed_at=now(),processing_error=NULL WHERE delivery_id=evt.delivery_id; END IF;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_rita_whatsapp_statuses() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_rita_whatsapp_statuses() TO service_role;
CREATE OR REPLACE FUNCTION public.record_rita_whatsapp_status(_delivery_id text,_payload jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(_delivery_id)<1 OR length(_delivery_id)>200 OR jsonb_typeof(_payload)<>'object' THEN RAISE EXCEPTION 'Invalid delivery'; END IF;
 INSERT INTO public.rita_whatsapp_status_inbox(delivery_id,payload) VALUES (_delivery_id,_payload) ON CONFLICT DO NOTHING;
 RETURN public.reconcile_rita_whatsapp_statuses();
END $$;
REVOKE ALL ON FUNCTION public.record_rita_whatsapp_status(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_rita_whatsapp_status(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_rita_whatsapp_links(_id uuid,_status text,_provider_id text DEFAULT NULL,_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.rita_whatsapp_link_sends;
BEGIN
 IF _status NOT IN ('accepted','failed','unknown') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 SELECT * INTO item FROM public.rita_whatsapp_link_sends WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing send'; END IF;
 IF item.status<>'sending' THEN RETURN; END IF;
 UPDATE public.rita_whatsapp_link_sends SET status=_status,provider_message_id=_provider_id,error=left(_error,2000),updated_at=now() WHERE id=_id;
 PERFORM public.reconcile_rita_whatsapp_statuses();
END $$;
REVOKE ALL ON FUNCTION public.finish_rita_whatsapp_links(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_rita_whatsapp_links(uuid,text,text,text) TO service_role;