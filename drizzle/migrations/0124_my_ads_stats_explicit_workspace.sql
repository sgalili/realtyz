CREATE OR REPLACE FUNCTION public.get_my_ads_stats_for(_workspace uuid)
RETURNS TABLE(listing_id uuid, relation text, title text, city text, address text, deal_type text, asking_price numeric, slug text, image_url text, views bigint, clicks bigint, affiliates bigint, is_hidden boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT (auth.uid() IS NOT NULL AND _workspace IS NOT NULL AND _workspace = public.current_workspace_owner()
      AND (_workspace = auth.uid() OR public.is_workspace_member(_workspace, auth.uid()) OR public.has_role(auth.uid(),'super_admin'::app_role))) AS ok
  ), mine AS (
    SELECT l.id,'owned'::text AS rel FROM public.listings l, allowed a
    WHERE a.ok AND l.workspace_owner_id = _workspace AND l.status<>'discarded'
      AND (l.is_published OR (l.status='live' AND COALESCE(l.features->>'hidden_by_owner','')='true'))
    UNION
    SELECT r.listing_id,'promoting' FROM public.affiliate_referrals r
    JOIN public.listings l ON l.id=r.listing_id, allowed a
    WHERE a.ok AND _workspace = auth.uid() AND r.affiliate_id=auth.uid()
      AND l.is_published AND l.affiliate_enabled AND l.status<>'discarded' AND l.workspace_owner_id <> _workspace
  )
  SELECT l.id,m.rel,l.property_title,l.city,l.address,l.deal_type,l.asking_price,l.slug,coalesce(l.image_url,l.media_photos->>0),
  CASE WHEN m.rel='owned' THEN l.public_views::bigint+coalesce((SELECT sum(s.views_count) FROM public.property_shares s WHERE s.listing_id=l.id),0)::bigint ELSE coalesce((SELECT sum(e.amount) FROM public.listing_stat_events e WHERE e.listing_id=l.id AND e.affiliate_id=auth.uid() AND e.event_type='view'),0)::bigint END,
  coalesce((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id=l.id AND (m.rel='owned' OR r.affiliate_id=auth.uid())),0)::bigint,
  (SELECT count(DISTINCT r.affiliate_id) FROM public.affiliate_referrals r WHERE r.listing_id=l.id)::bigint,
  (NOT l.is_published)
  FROM mine m JOIN public.listings l ON l.id=m.id;
$function$;
REVOKE ALL ON FUNCTION public.get_my_ads_stats_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ads_stats_for(uuid) TO authenticated;