UPDATE public.listings SET contact_options = coalesce(contact_options, '{}'::jsonb) || jsonb_build_object('lead_daily_limits', coalesce(features->'lead_daily_limits', jsonb_build_object('form',daily_lead_cap,'whatsapp',daily_lead_cap,'phone',daily_lead_cap))) WHERE NOT (coalesce(contact_options,'{}'::jsonb) ? 'lead_daily_limits') AND (features ? 'lead_daily_limits' OR daily_lead_cap IS NOT NULL);
COMMENT ON COLUMN public.listings.daily_lead_cap IS 'DEPRECATED: replaced by contact_options.lead_daily_limits per priced inquiry type';
CREATE OR REPLACE FUNCTION public.listing_tier_cap_reached(_listing_id uuid, _tier integer) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce((SELECT CASE WHEN (l.contact_options->'lead_daily_limits'->>CASE _tier WHEN 1 THEN 'form' WHEN 2 THEN 'whatsapp' WHEN 3 THEN 'phone' END) ~ '^[1-9][0-9]*$' THEN (SELECT count(*) FROM public.listing_lead_charges c WHERE c.listing_id=l.id AND c.workspace_owner_id=l.workspace_owner_id AND c.tier=_tier AND NOT c.is_leftover AND c.created_at>now()-interval '24 hours') >= (l.contact_options->'lead_daily_limits'->>CASE _tier WHEN 1 THEN 'form' WHEN 2 THEN 'whatsapp' WHEN 3 THEN 'phone' END)::numeric ELSE false END FROM public.listings l WHERE l.id=_listing_id),false)
$$;
REVOKE ALL ON FUNCTION public.listing_tier_cap_reached(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listing_tier_cap_reached(uuid,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.listing_daily_cap_reached(_listing_id uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce((SELECT (coalesce(l.affiliate_tier1_amount,0)>0 OR coalesce(l.affiliate_tier2_amount,0)>0 OR coalesce(l.affiliate_tier3_amount,0)>0) AND (coalesce(l.affiliate_tier1_amount,0)<=0 OR public.listing_tier_cap_reached(l.id,1)) AND (coalesce(l.affiliate_tier2_amount,0)<=0 OR public.listing_tier_cap_reached(l.id,2)) AND (coalesce(l.affiliate_tier3_amount,0)<=0 OR public.listing_tier_cap_reached(l.id,3)) FROM public.listings l WHERE l.id=_listing_id),false)
$$;
REVOKE ALL ON FUNCTION public.listing_daily_cap_reached(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listing_daily_cap_reached(uuid) TO service_role;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.charge_lead_commission(uuid,integer,uuid,uuid)'::regprocedure) INTO definition;
 IF position('public.listing_daily_cap_reached(l.id)' in definition)=0 THEN RAISE EXCEPTION 'Expected cap call not found'; END IF;
 definition:=replace(definition,'public.listing_daily_cap_reached(l.id)','public.listing_tier_cap_reached(l.id,_tier)');
 definition:=replace(definition,'PERFORM pg_advisory_xact_lock(hashtextextended(l.id::text||'':''||ld.id::text,31));','PERFORM pg_advisory_xact_lock(hashtextextended(l.id::text,32)); PERFORM pg_advisory_xact_lock(hashtextextended(l.id::text||'':''||ld.id::text,31));');
 definition:=replace(definition,'ELSE
  v_delta:=greatest(v_gross-c.gross,0);','ELSE
  IF NOT c.is_leftover AND public.listing_tier_cap_reached(l.id,_tier) THEN RETURN jsonb_build_object(''ok'',true,''charged'',0,''tier_cap_reached'',true,''tier'',_tier); END IF;
  v_delta:=greatest(v_gross-c.gross,0);');
 EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.validate_individual_lead_limits() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE caps jsonb; k text; v jsonb; BEGIN
 caps:=NEW.contact_options->'lead_daily_limits';
 IF caps IS NOT NULL AND jsonb_typeof(caps)<>'object' THEN RAISE EXCEPTION 'lead daily limits must be an object'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(coalesce(caps,'{}'::jsonb)) LOOP
 IF k NOT IN ('form','whatsapp','phone') OR (v<>'null'::jsonb AND (jsonb_typeof(v)<>'number' OR v::text !~ '^[1-9][0-9]*$' OR (v::text)::numeric>2147483647)) THEN RAISE EXCEPTION 'individual lead cap must be a positive integer or null'; END IF;
 END LOOP; RETURN NEW; END $$;
CREATE TRIGGER validate_individual_lead_limits BEFORE INSERT OR UPDATE OF contact_options ON public.listings FOR EACH ROW EXECUTE FUNCTION public.validate_individual_lead_limits();