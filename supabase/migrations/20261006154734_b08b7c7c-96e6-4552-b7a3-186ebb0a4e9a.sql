CREATE OR REPLACE FUNCTION public.get_my_ads_stats()
 RETURNS TABLE(listing_id uuid, relation text, title text, city text, address text, deal_type text, asking_price numeric, slug text, image_url text, views bigint, clicks bigint, affiliates bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH mine AS (
   SELECT l.id,'owned'::text AS rel FROM public.listings l
   WHERE auth.uid() IS NOT NULL AND public.ws_current_access(l.workspace_owner_id) AND l.status<>'discarded' AND l.is_published
   UNION
   SELECT r.listing_id,'promoting' FROM public.affiliate_referrals r
   JOIN public.listings l ON l.id=r.listing_id
   WHERE auth.uid() IS NOT NULL AND r.affiliate_id=auth.uid() AND l.is_published AND l.affiliate_enabled AND l.status<>'discarded' AND NOT public.ws_current_access(l.workspace_owner_id)
 )
 SELECT l.id,m.rel,l.property_title,l.city,l.address,l.deal_type,l.asking_price,l.slug,coalesce(l.image_url,l.media_photos->>0),
 CASE WHEN m.rel='owned' THEN l.public_views::bigint+coalesce((SELECT sum(s.views_count) FROM public.property_shares s WHERE s.listing_id=l.id),0)::bigint ELSE coalesce((SELECT sum(e.amount) FROM public.listing_stat_events e WHERE e.listing_id=l.id AND e.affiliate_id=auth.uid() AND e.event_type='view'),0)::bigint END,
 coalesce((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id=l.id AND (m.rel='owned' OR r.affiliate_id=auth.uid())),0)::bigint,
 (SELECT count(DISTINCT r.affiliate_id) FROM public.affiliate_referrals r WHERE r.listing_id=l.id)::bigint
 FROM mine m JOIN public.listings l ON l.id=m.id;
$function$;