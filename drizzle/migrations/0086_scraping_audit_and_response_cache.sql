CREATE TABLE public.scraping_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 feature text NOT NULL, operation text NOT NULL, target_hash text, workspace_owner_id uuid,
 outcome text NOT NULL DEFAULT 'started', http_status integer, duration_ms bigint NOT NULL DEFAULT 0, response_bytes bigint NOT NULL DEFAULT 0
);
GRANT SELECT ON public.scraping_usage_events TO authenticated;
GRANT ALL ON public.scraping_usage_events TO service_role;
ALTER TABLE public.scraping_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY scraping_audit_super_admin ON public.scraping_usage_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX scraping_usage_time_feature_idx ON public.scraping_usage_events(created_at DESC,feature);
CREATE TABLE public.scraping_response_cache (
 cache_key text PRIMARY KEY, payload text, fetched_at timestamptz, lease_token uuid, lease_until timestamptz
);
GRANT ALL ON public.scraping_response_cache TO service_role;
ALTER TABLE public.scraping_response_cache ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.claim_scraping_response(_key text,_ttl_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.scraping_response_cache; t uuid:=gen_random_uuid();
BEGIN
 IF length(_key)>128 OR _ttl_seconds<1 OR _ttl_seconds>86400 THEN RAISE EXCEPTION 'invalid_cache_key'; END IF;
 INSERT INTO public.scraping_response_cache(cache_key) VALUES(_key) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.scraping_response_cache WHERE cache_key=_key FOR UPDATE;
 IF r.payload IS NOT NULL AND r.fetched_at>now()-make_interval(secs=>_ttl_seconds) THEN RETURN jsonb_build_object('state','cached','payload',r.payload,'fetched_at',r.fetched_at); END IF;
 IF r.lease_until>now() THEN RETURN jsonb_build_object('state','busy'); END IF;
 UPDATE public.scraping_response_cache SET lease_token=t,lease_until=now()+interval '3 minutes' WHERE cache_key=_key;
 RETURN jsonb_build_object('state','claimed','token',t);
END $$;
REVOKE ALL ON FUNCTION public.claim_scraping_response(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scraping_response(text,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.get_scraping_usage_report(_days integer DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_from timestamptz; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;
 IF _days<1 OR _days>30 THEN RAISE EXCEPTION 'invalid_days'; END IF;
 v_from:=now()-make_interval(days=>_days);
 WITH e AS (SELECT * FROM public.scraping_usage_events WHERE created_at>=v_from),
 features AS (SELECT feature,operation,count(*) FILTER(WHERE outcome<>'cache_hit') AS attempts,count(*) FILTER(WHERE outcome='started') AS in_flight,count(*) FILTER(WHERE outcome='success') AS successes,count(*) FILTER(WHERE outcome='error') AS errors,count(*) FILTER(WHERE outcome='cache_hit') AS cache_hits,sum(response_bytes) AS bytes,round(avg(duration_ms) FILTER(WHERE outcome IN ('success','error'))) AS avg_ms FROM e GROUP BY feature,operation),
 daily AS (SELECT (created_at AT TIME ZONE 'Asia/Jerusalem')::date AS day,count(*) FILTER(WHERE outcome<>'cache_hit') AS attempts,count(*) FILTER(WHERE outcome='cache_hit') AS cache_hits,count(*) FILTER(WHERE outcome='error') AS errors FROM e GROUP BY 1),
 charges AS (SELECT split_part(note,'|',1) AS feature,count(*) AS charges,sum(-amount_ils)*25 AS credits FROM public.credit_transactions WHERE created_at>=v_from AND type='action_charge' AND amount_ils<0 GROUP BY 1),
 runs AS (SELECT source,slot,status,claimed_at,finished_at,scraped_count,new_count,error FROM public.market_scrape_runs WHERE claimed_at>=v_from ORDER BY claimed_at DESC LIMIT 50)
 SELECT jsonb_build_object('from',v_from,'to',now(),'checked_at',now(),'tracking_started_at',(SELECT min(created_at) FROM public.scraping_usage_events),
 'features',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY attempts DESC) FROM features f),'[]'),
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY day) FROM daily d),'[]'),
 'credits',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY credits DESC) FROM charges c),'[]'),
 'runs',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM runs r),'[]'),
 'last_hour',jsonb_build_object('attempts',(SELECT count(*) FROM e WHERE created_at>=now()-interval '1 hour' AND outcome<>'cache_hit'),'errors',(SELECT count(*) FROM e WHERE created_at>=now()-interval '1 hour' AND outcome='error'),'credits',(SELECT coalesce(sum(-amount_ils)*25,0) FROM public.credit_transactions WHERE created_at>=now()-interval '1 hour' AND type='action_charge' AND amount_ils<0)),
 'alerts',jsonb_build_object('provider_denials',(SELECT count(*) FROM e WHERE created_at>=now()-interval '24 hours' AND http_status IN (401,402,403)),'errors_today',(SELECT count(*) FROM e WHERE created_at>=now()-interval '24 hours' AND outcome='error'),'stalled_calls',(SELECT count(*) FROM e WHERE outcome='started' AND created_at<now()-interval '3 minutes'),'empty_runs',(SELECT count(*) FROM public.market_scrape_runs WHERE claimed_at>=v_from AND status='success' AND scraped_count=0),'last_scheduled_run',(SELECT max(claimed_at) FROM public.market_scrape_runs WHERE source='yad2'))
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_scraping_usage_report(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_scraping_usage_report(integer) TO authenticated;