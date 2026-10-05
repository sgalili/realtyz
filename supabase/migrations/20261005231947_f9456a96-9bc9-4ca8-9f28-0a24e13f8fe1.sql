CREATE OR REPLACE FUNCTION public.get_my_ads_stats()
RETURNS TABLE(listing_id uuid, relation text, title text, city text, address text, deal_type text, asking_price numeric, slug text, image_url text, views bigint, clicks bigint, affiliates bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH mine AS (
 SELECT l.id,'owned'::text AS rel FROM public.listings l WHERE auth.uid() IS NOT NULL AND public.ws_current_access(l.workspace_owner_id) AND l.status<>'discarded' AND l.is_published AND ((l.owner_id=auth.uid() AND public.has_role(auth.uid(),'property_owner')) OR EXISTS (SELECT 1 FROM public.affiliate_referrals r WHERE r.listing_id=l.id))
 UNION SELECT r.listing_id,'promoting' FROM public.affiliate_referrals r JOIN public.listings l ON l.id=r.listing_id WHERE auth.uid() IS NOT NULL AND r.affiliate_id=auth.uid() AND l.is_published AND l.affiliate_enabled AND l.status<>'discarded' AND NOT public.ws_current_access(l.workspace_owner_id)
 )
 SELECT l.id,m.rel,l.property_title,l.city,l.address,l.deal_type,l.asking_price,l.slug,coalesce(l.image_url,l.media_photos->>0),
 CASE WHEN m.rel='owned' THEN l.public_views::bigint+coalesce((SELECT sum(s.views_count) FROM public.property_shares s WHERE s.listing_id=l.id),0)::bigint ELSE coalesce((SELECT sum(e.amount) FROM public.listing_stat_events e WHERE e.listing_id=l.id AND e.affiliate_id=auth.uid() AND e.event_type='view'),0)::bigint END,
 coalesce((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id=l.id AND (m.rel='owned' OR r.affiliate_id=auth.uid())),0)::bigint,
 (SELECT count(DISTINCT r.affiliate_id) FROM public.affiliate_referrals r WHERE r.listing_id=l.id)::bigint
 FROM mine m JOIN public.listings l ON l.id=m.id;
$$;
CREATE OR REPLACE FUNCTION public.track_listing_referral_view(_id_or_slug text,_code text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.listings%ROWTYPE; a uuid;
BEGIN
 SELECT * INTO l FROM public.listings WHERE (id::text=_id_or_slug OR slug=_id_or_slug) AND is_published AND status='live' LIMIT 1;
 IF l.id IS NULL THEN RETURN; END IF;
 SELECT affiliate_id INTO a FROM public.affiliate_referrals WHERE listing_id=l.id AND tracking_code=_code LIMIT 1;
 UPDATE public.listings SET public_views=public_views+1 WHERE id=l.id;
 INSERT INTO public.listing_stat_events(listing_id,workspace_owner_id,affiliate_id,event_type) VALUES(l.id,l.workspace_owner_id,a,'view');
END; $$;
REVOKE ALL ON FUNCTION public.track_listing_referral_view(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_listing_referral_view(text,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_my_ad_history(_listing_id uuid,_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owned boolean; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT public.ws_current_access(l.workspace_owner_id) INTO owned FROM public.listings l WHERE l.id=_listing_id;
 IF owned IS NULL OR (NOT owned AND NOT EXISTS(SELECT 1 FROM public.affiliate_referrals r JOIN public.listings l ON l.id=r.listing_id WHERE r.listing_id=_listing_id AND r.affiliate_id=auth.uid() AND l.is_published AND l.affiliate_enabled)) THEN RAISE EXCEPTION 'Access denied'; END IF;
 WITH history AS (
 SELECT e.id::text AS id,e.created_at AS at,e.event_type AS type,e.amount::numeric AS amount,e.affiliate_id FROM public.listing_stat_events e WHERE e.listing_id=_listing_id AND (owned OR e.affiliate_id=auth.uid())
 UNION ALL SELECT r.id::text,r.created_at,'promotion',1,r.affiliate_id FROM public.affiliate_referrals r WHERE r.listing_id=_listing_id AND (owned OR r.affiliate_id=auth.uid())
 UNION ALL SELECT c.id::text,c.created_at,'contact',c.gross,c.affiliate_id FROM public.listing_lead_charges c WHERE c.listing_id=_listing_id AND (owned OR c.affiliate_id=auth.uid())
 UNION ALL SELECT c.id::text||'-paid',c.purchased_at,'purchase',c.purchase_price,c.affiliate_id FROM public.listing_lead_charges c WHERE c.listing_id=_listing_id AND c.purchased_at IS NOT NULL AND (owned OR c.affiliate_id=auth.uid())
 UNION ALL SELECT s.id::text,s.created_at,'contact',s.earned_amount,s.affiliate_id FROM public.affiliate_lead_submissions s WHERE s.listing_id=_listing_id AND (owned OR s.affiliate_id=auth.uid())
 )
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY at DESC,id DESC) FROM (SELECT h.*,coalesce(p.display_name,'') AS name FROM history h LEFT JOIN public.affiliate_profiles p ON p.user_id=h.affiliate_id ORDER BY at DESC,id DESC LIMIT 100 OFFSET greatest(0,least(_offset,1000000))) h),'[]'::jsonb),'total',(SELECT count(*) FROM history)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_my_ad_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_ad_history(uuid,integer) TO authenticated;