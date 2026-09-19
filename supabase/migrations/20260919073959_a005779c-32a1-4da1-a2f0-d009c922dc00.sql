CREATE OR REPLACE FUNCTION public.get_affiliate_referral_listings()
RETURNS TABLE(
  listing_id uuid, broker_id uuid, property_title text, address text, city text,
  neighborhood text, property_type text, deal_type text, rooms numeric, sqm numeric,
  asking_price numeric, image_url text, media_photos jsonb, slug text,
  reward_type text, reward_amount numeric, approved_at timestamp with time zone,
  tier1_amount numeric, tier2_amount numeric, tier3_type text, tier3_amount numeric,
  broker_name text, office_name text, broker_license_number text, agency_logo_url text,
  latitude numeric, longitude numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (l.id)
    l.id,
    COALESCE(l.workspace_owner_id, l.user_id),
    l.property_title,
    l.address,
    l.city,
    l.neighborhood,
    COALESCE(NULLIF(l.attributes->>'property_type', ''), NULLIF(l.source_metadata->>'property_type', '')),
    l.deal_type,
    l.rooms,
    l.sqm,
    l.asking_price,
    l.image_url,
    l.media_photos,
    l.slug,
    l.affiliate_reward_type,
    l.affiliate_reward_amount,
    l.affiliate_approved_at,
    l.affiliate_tier1_amount,
    l.affiliate_tier2_amount,
    l.affiliate_tier3_type,
    l.affiliate_tier3_amount,
    COALESCE(NULLIF(btrim(p.broker_byline), ''), NULLIF(btrim(p.full_name), ''), 'שם המתווך לא צוין'),
    COALESCE(NULLIF(btrim(wl.agency_name), ''), NULLIF(btrim(wm.workspace_name), ''), 'שם המשרד לא צוין'),
    NULLIF(btrim(p.broker_license_number), ''),
    COALESCE(NULLIF(btrim(wl.landscape_logo_url), ''), NULLIF(btrim(wl.logo_url), ''), NULLIF(btrim(wm.workspace_logo_url), '')),
    l.latitude,
    l.longitude
  FROM public.affiliate_referrals r
  JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.white_label_settings wl ON wl.user_id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN LATERAL (
    SELECT x.workspace_name, x.workspace_logo_url
    FROM public.workspace_memberships x
    WHERE x.workspace_owner_id = COALESCE(l.workspace_owner_id, l.user_id)
    ORDER BY (x.user_id = x.workspace_owner_id) DESC, x.created_at ASC
    LIMIT 1
  ) wm ON true
  WHERE r.affiliate_id = auth.uid()
$function$;

REVOKE ALL ON FUNCTION public.get_affiliate_referral_listings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_referral_listings() TO authenticated;