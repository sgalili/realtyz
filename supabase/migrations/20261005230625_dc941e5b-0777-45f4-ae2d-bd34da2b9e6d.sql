ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS public_views integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.track_listing_view(_id_or_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.listings SET public_views = public_views + 1
   WHERE id::text = _id_or_slug OR slug = _id_or_slug;
$$;
GRANT EXECUTE ON FUNCTION public.track_listing_view(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_ads_stats()
RETURNS TABLE(listing_id uuid, relation text, title text, city text, address text, deal_type text, asking_price numeric, slug text, image_url text, views bigint, clicks bigint, affiliates bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ws AS (SELECT public.current_workspace_owner() AS owner),
  mine AS (
    SELECT l.id, 'owned'::text AS rel FROM public.listings l, ws
     WHERE auth.uid() IS NOT NULL AND l.workspace_owner_id = ws.owner
       AND EXISTS (SELECT 1 FROM public.affiliate_referrals r WHERE r.listing_id = l.id)
    UNION
    SELECT r.listing_id, 'promoting' FROM public.affiliate_referrals r
     WHERE auth.uid() IS NOT NULL AND r.affiliate_id = auth.uid()
  )
  SELECT l.id, m.rel, l.property_title, l.city, l.address, l.deal_type, l.asking_price, l.slug, l.image_url,
         l.public_views::bigint
           + COALESCE((SELECT sum(s.views_count) FROM public.property_shares s WHERE s.listing_id = l.id), 0)::bigint,
         COALESCE((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id = l.id), 0)::bigint,
         (SELECT count(DISTINCT r.affiliate_id) FROM public.affiliate_referrals r WHERE r.listing_id = l.id)::bigint
    FROM mine m JOIN public.listings l ON l.id = m.id;
$$;
REVOKE ALL ON FUNCTION public.get_my_ads_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ads_stats() TO authenticated;