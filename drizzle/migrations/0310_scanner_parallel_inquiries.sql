ALTER TABLE public.broker_wa_scanner_settings DROP CONSTRAINT broker_wa_scanner_settings_daily_cap_check;
ALTER TABLE public.broker_wa_scanner_settings ADD CONSTRAINT broker_wa_scanner_settings_daily_cap_check CHECK (daily_cap BETWEEN 1 AND 150);
ALTER TABLE public.broker_wa_scanner_settings ADD COLUMN IF NOT EXISTS max_outstanding integer NOT NULL DEFAULT 1 CHECK (max_outstanding BETWEEN 1 AND 5);
UPDATE public.broker_wa_scanner_settings SET daily_cap=120, max_outstanding=3, updated_at=now() WHERE id;

CREATE OR REPLACE FUNCTION public.match_broker_wa_scanner_reply_by_name(_event uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.broker_wa_scanner_events; ids uuid[];
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.broker_wa_scanner_events WHERE id=_event;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT array_agg(j.id) INTO ids FROM public.broker_wa_scanner_jobs j
  WHERE j.status='awaiting_reply' AND j.instance_id=e.instance_id AND e.chat_id=j.target_phone||'@c.us'
    AND public.scanner_reply_names_broker(e.reply_text,j.broker_id);
 IF coalesce(array_length(ids,1),0)=1 THEN RETURN ids[1]; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.match_broker_wa_scanner_reply_by_name(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_broker_wa_scanner_reply_by_name(uuid) TO service_role;

DO $m$ DECLARE d text; BEGIN
 d := pg_get_functiondef('public.complete_broker_wa_scanner_reply'::regproc);
 d := replace(d, 'AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs o WHERE o.id<>j.id AND o.status IN(''sending'',''awaiting_reply''))',
  'AND NOT EXISTS(SELECT 1 FROM public.broker_wa_scanner_jobs o WHERE o.id<>j.id AND o.status=''awaiting_reply'' AND o.instance_id=j.instance_id AND o.target_phone=j.target_phone AND public.scanner_reply_names_broker(e.reply_text,o.broker_id))');
 IF position('o.status=''awaiting_reply''' IN d)=0 THEN RAISE EXCEPTION 'patch_failed'; END IF;
 EXECUTE d;
END $m$;