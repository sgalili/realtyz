CREATE TABLE public.yad2_item_cache (
 item_id text PRIMARY KEY,
 source_url text NOT NULL,
 payload jsonb,
 fetched_at timestamptz,
 last_attempt_at timestamptz,
 claim_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.yad2_item_cache TO service_role;
ALTER TABLE public.yad2_item_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY yad2_cache_service ON public.yad2_item_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER yad2_cache_touch BEFORE UPDATE ON public.yad2_item_cache FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE OR REPLACE FUNCTION public.claim_yad2_item_import(_item text, _url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.yad2_item_cache; t uuid := gen_random_uuid();
BEGIN
 IF _item !~ '^[a-zA-Z0-9_-]{1,128}$' THEN RAISE EXCEPTION 'Invalid item'; END IF;
 INSERT INTO public.yad2_item_cache(item_id,source_url) VALUES(lower(_item),_url) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.yad2_item_cache WHERE item_id=lower(_item) FOR UPDATE;
 IF r.fetched_at > now()-interval '24 hours' AND r.payload IS NOT NULL THEN
  RETURN jsonb_build_object('state','cached','payload',r.payload,'fetched_at',r.fetched_at);
 END IF;
 IF r.last_attempt_at > now()-interval '24 hours' THEN
  RETURN jsonb_build_object('state',CASE WHEN r.claim_token IS NOT NULL AND r.last_attempt_at>now()-interval '3 minutes' THEN 'busy' ELSE 'limited' END,'payload',r.payload,'fetched_at',r.fetched_at,'retry_at',r.last_attempt_at+interval '24 hours');
 END IF;
 UPDATE public.yad2_item_cache SET last_attempt_at=now(),claim_token=t,source_url=_url WHERE item_id=lower(_item);
 RETURN jsonb_build_object('state','claimed','token',t);
END $$;
REVOKE ALL ON FUNCTION public.claim_yad2_item_import(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_yad2_item_import(text,text) TO service_role;