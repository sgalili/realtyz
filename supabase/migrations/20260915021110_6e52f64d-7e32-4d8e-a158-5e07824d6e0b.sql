DROP FUNCTION IF EXISTS public.get_affiliate_marketplace();

CREATE FUNCTION public.get_affiliate_marketplace()
RETURNS TABLE(
  listing_id uuid,
  broker_id uuid,
  property_title text,
  address text,
  city text,
  deal_type text,
  rooms numeric,
  asking_price numeric,
  image_url text,
  media_photos jsonb,
  slug text,
  reward_type text,
  reward_amount numeric,
  approved_at timestamptz,
  tier1_amount numeric,
  tier2_amount numeric,
  tier3_type text,
  tier3_amount numeric,
  broker_name text,
  office_name text,
  agency_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    l.id,
    COALESCE(l.workspace_owner_id, l.user_id),
    l.property_title,
    l.address,
    l.city,
    l.deal_type,
    l.rooms,
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
    COALESCE(NULLIF(btrim(wl.landscape_logo_url), ''), NULLIF(btrim(wl.logo_url), ''), NULLIF(btrim(wm.workspace_logo_url), ''))
  FROM public.listings l
  LEFT JOIN public.profiles p
    ON p.id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.white_label_settings wl
    ON wl.user_id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN LATERAL (
    SELECT x.workspace_name, x.workspace_logo_url
    FROM public.workspace_memberships x
    WHERE x.workspace_owner_id = COALESCE(l.workspace_owner_id, l.user_id)
    ORDER BY (x.user_id = x.workspace_owner_id) DESC, x.created_at ASC
    LIMIT 1
  ) wm ON true
  WHERE l.affiliate_enabled = true
    AND COALESCE(l.status, 'live') = 'live'
    AND public.is_affiliate(auth.uid())
  ORDER BY l.affiliate_approved_at DESC NULLS LAST, l.created_at DESC
$function$;

REVOKE ALL ON FUNCTION public.get_affiliate_marketplace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_affiliate_marketplace() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace() TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_listing_with_attribution(_identifier text)
RETURNS TABLE(
  listing_id uuid,
  slug text,
  property_title text,
  address text,
  city text,
  neighborhood text,
  deal_type text,
  rooms numeric,
  sqm numeric,
  floor numeric,
  asking_price numeric,
  description text,
  short_description text,
  features jsonb,
  image_url text,
  media_photos jsonb,
  broker_id uuid,
  broker_name text,
  office_name text,
  agency_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    l.id,
    l.slug,
    l.property_title,
    l.address,
    l.city,
    l.neighborhood,
    l.deal_type,
    l.rooms,
    l.sqm,
    l.floor,
    l.asking_price,
    l.description,
    l.short_description,
    l.features,
    l.image_url,
    l.media_photos,
    COALESCE(l.workspace_owner_id, l.user_id),
    COALESCE(NULLIF(btrim(p.broker_byline), ''), NULLIF(btrim(p.full_name), ''), 'שם המתווך לא צוין'),
    COALESCE(NULLIF(btrim(wl.agency_name), ''), NULLIF(btrim(wm.workspace_name), ''), 'שם המשרד לא צוין'),
    COALESCE(NULLIF(btrim(wl.landscape_logo_url), ''), NULLIF(btrim(wl.logo_url), ''), NULLIF(btrim(wm.workspace_logo_url), ''))
  FROM public.listings l
  LEFT JOIN public.profiles p
    ON p.id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.white_label_settings wl
    ON wl.user_id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN LATERAL (
    SELECT x.workspace_name, x.workspace_logo_url
    FROM public.workspace_memberships x
    WHERE x.workspace_owner_id = COALESCE(l.workspace_owner_id, l.user_id)
    ORDER BY (x.user_id = x.workspace_owner_id) DESC, x.created_at ASC
    LIMIT 1
  ) wm ON true
  WHERE (l.slug = _identifier OR l.id::text = _identifier)
    AND (l.is_published = true OR (l.affiliate_enabled = true AND COALESCE(l.status, 'live') = 'live'))
  ORDER BY (l.slug = _identifier) DESC
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.get_public_listing_with_attribution(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_listing_with_attribution(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_listing_with_attribution(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_listing_with_attribution(text) TO service_role;