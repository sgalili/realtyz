CREATE OR REPLACE FUNCTION public.enforce_private_owner_listing_limit() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RETURN NEW; END; $$;
CREATE TABLE public.listing_stat_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
 workspace_owner_id uuid NOT NULL, affiliate_id uuid, event_type text NOT NULL CHECK(event_type IN ('view','click')), amount integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.listing_stat_events TO authenticated;
GRANT ALL ON public.listing_stat_events TO service_role;
ALTER TABLE public.listing_stat_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_stat_events_workspace_read ON public.listing_stat_events FOR SELECT TO authenticated USING (public.ws_current_access(workspace_owner_id));
CREATE INDEX listing_stat_events_listing_date ON public.listing_stat_events(listing_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.track_listing_view(_id_or_slug text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.listings%ROWTYPE;
BEGIN
 SELECT * INTO l FROM public.listings WHERE (id::text=_id_or_slug OR slug=_id_or_slug) AND is_published=true AND status='live' LIMIT 1;
 IF l.id IS NULL THEN RETURN; END IF;
 UPDATE public.listings SET public_views=public_views+1 WHERE id=l.id;
 INSERT INTO public.listing_stat_events(listing_id,workspace_owner_id,event_type) VALUES(l.id,l.workspace_owner_id,'view');
END; $$;
REVOKE ALL ON FUNCTION public.track_listing_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_listing_view(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.record_affiliate_click_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(NEW.clicks,0)>coalesce(OLD.clicks,0) THEN
 INSERT INTO public.listing_stat_events(listing_id,workspace_owner_id,affiliate_id,event_type,amount)
 SELECT l.id,l.workspace_owner_id,NEW.affiliate_id,'click',NEW.clicks-coalesce(OLD.clicks,0) FROM public.listings l WHERE l.id=NEW.listing_id;
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER affiliate_click_stat_event AFTER UPDATE OF clicks ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.record_affiliate_click_event();
CREATE OR REPLACE FUNCTION public.get_my_ads_stats()
RETURNS TABLE(listing_id uuid, relation text, title text, city text, address text, deal_type text, asking_price numeric, slug text, image_url text, views bigint, clicks bigint, affiliates bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH mine AS (
 SELECT l.id,'owned'::text AS rel FROM public.listings l WHERE auth.uid() IS NOT NULL AND public.ws_current_access(l.workspace_owner_id) AND l.status<>'discarded' AND l.is_published
 UNION SELECT r.listing_id,'promoting' FROM public.affiliate_referrals r JOIN public.listings l ON l.id=r.listing_id WHERE auth.uid() IS NOT NULL AND r.affiliate_id=auth.uid() AND l.is_published AND l.status<>'discarded'
 )
 SELECT l.id,m.rel,l.property_title,l.city,l.address,l.deal_type,l.asking_price,l.slug,coalesce(l.image_url,l.media_photos->>0),
 l.public_views::bigint+coalesce((SELECT sum(s.views_count) FROM public.property_shares s WHERE s.listing_id=l.id),0)::bigint,
 coalesce((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id=l.id AND (m.rel='owned' OR r.affiliate_id=auth.uid())),0)::bigint,
 (SELECT count(DISTINCT r.affiliate_id) FROM public.affiliate_referrals r WHERE r.listing_id=l.id)::bigint
 FROM mine m JOIN public.listings l ON l.id=m.id;
$$;
REVOKE ALL ON FUNCTION public.get_my_ads_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_ads_stats() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_my_ad_details(_listing_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owned boolean; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT public.ws_current_access(l.workspace_owner_id) INTO owned FROM public.listings l WHERE l.id=_listing_id;
 IF owned IS NULL OR (NOT owned AND NOT EXISTS(SELECT 1 FROM public.affiliate_referrals r JOIN public.listings l ON l.id=r.listing_id WHERE r.listing_id=_listing_id AND r.affiliate_id=auth.uid() AND l.is_published AND l.affiliate_enabled)) THEN RAISE EXCEPTION 'Access denied'; END IF;
 WITH affiliate_ids AS (
 SELECT DISTINCT affiliate_id FROM public.affiliate_referrals WHERE listing_id=_listing_id AND (owned OR affiliate_id=auth.uid())
 ), metrics AS (
 SELECT a.affiliate_id,coalesce(p.display_name,'שותף') AS name,
 coalesce((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id=_listing_id AND r.affiliate_id=a.affiliate_id),0) AS clicks,
 (SELECT count(DISTINCT r.lead_id) FROM (SELECT lead_id FROM public.affiliate_referrals WHERE listing_id=_listing_id AND affiliate_id=a.affiliate_id UNION SELECT lead_id FROM public.affiliate_lead_submissions WHERE listing_id=_listing_id AND affiliate_id=a.affiliate_id UNION SELECT lead_id FROM public.listing_lead_charges WHERE listing_id=_listing_id AND affiliate_id=a.affiliate_id) r WHERE r.lead_id IS NOT NULL) AS leads,
 coalesce((SELECT sum(c.gross) FILTER(WHERE NOT c.is_leftover)+coalesce(sum(c.purchase_price) FILTER(WHERE c.purchased_at IS NOT NULL),0) FROM public.listing_lead_charges c WHERE c.listing_id=_listing_id AND c.affiliate_id=a.affiliate_id),0) AS paid_bids,
 (SELECT count(*) FROM public.listing_lead_charges c WHERE c.listing_id=_listing_id AND c.affiliate_id=a.affiliate_id AND (NOT c.is_leftover OR c.purchased_at IS NOT NULL)) AS paid_count,
 (SELECT min(created_at) FROM public.affiliate_referrals r WHERE r.listing_id=_listing_id AND r.affiliate_id=a.affiliate_id) AS since,
 (SELECT max(updated_at) FROM public.affiliate_referrals r WHERE r.listing_id=_listing_id AND r.affiliate_id=a.affiliate_id) AS last_activity
 FROM affiliate_ids a LEFT JOIN public.affiliate_profiles p ON p.user_id=a.affiliate_id
 ), history AS (
 SELECT e.id::text AS id,e.created_at AS at,e.event_type AS type,e.amount::numeric AS amount,e.affiliate_id FROM public.listing_stat_events e WHERE e.listing_id=_listing_id AND (owned OR e.affiliate_id=auth.uid())
 UNION ALL SELECT r.id::text,r.created_at,'promotion',1,r.affiliate_id FROM public.affiliate_referrals r WHERE r.listing_id=_listing_id AND (owned OR r.affiliate_id=auth.uid())
 UNION ALL SELECT c.id::text,c.created_at,'contact',c.gross,c.affiliate_id FROM public.listing_lead_charges c WHERE c.listing_id=_listing_id AND (owned OR c.affiliate_id=auth.uid())
 UNION ALL SELECT c.id::text||'-paid',c.purchased_at,'purchase',c.purchase_price,c.affiliate_id FROM public.listing_lead_charges c WHERE c.listing_id=_listing_id AND c.purchased_at IS NOT NULL AND (owned OR c.affiliate_id=auth.uid())
 )
 SELECT jsonb_build_object('affiliates',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY clicks DESC) FROM metrics m),'[]'::jsonb),'history',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY at DESC) FROM (SELECT h.*,coalesce(p.display_name,'') AS name FROM history h LEFT JOIN public.affiliate_profiles p ON p.user_id=h.affiliate_id ORDER BY at DESC LIMIT 200) h),'[]'::jsonb),'history_started_at',(SELECT min(created_at) FROM public.listing_stat_events WHERE listing_id=_listing_id),'has_older_history',(SELECT count(*)>200 FROM history),'owned',owned) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_my_ad_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_ad_details(uuid) TO authenticated;