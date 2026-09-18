CREATE OR REPLACE FUNCTION public.get_affiliate_marketplace_v2()
RETURNS TABLE(
  listing_id uuid,
  broker_id uuid,
  property_title text,
  address text,
  city text,
  neighborhood text,
  property_type text,
  deal_type text,
  rooms numeric,
  sqm numeric,
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
  broker_license_number text,
  agency_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
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
    COALESCE(NULLIF(btrim(wl.landscape_logo_url), ''), NULLIF(btrim(wl.logo_url), ''), NULLIF(btrim(wm.workspace_logo_url), ''))
  FROM public.listings l
  LEFT JOIN public.profiles p ON p.id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.white_label_settings wl ON wl.user_id = COALESCE(l.workspace_owner_id, l.user_id)
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
$$;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace_v2() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_affiliate_marketplace_v2() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_affiliate_marketplace_v2() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.backfill_affiliate_funnel_on_enable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_row record;
  code_value text;
BEGIN
  IF NEW.auto_funnel_enabled IS NOT TRUE OR (TG_OP = 'UPDATE' AND OLD.auto_funnel_enabled IS TRUE) THEN
    RETURN NEW;
  END IF;

  FOR listing_row IN
    SELECT l.*
    FROM public.listings l
    WHERE l.affiliate_enabled IS TRUE
      AND COALESCE(l.status, 'live') = 'live'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.affiliate_referrals ar
      WHERE ar.affiliate_id = NEW.user_id
        AND ar.listing_id = listing_row.id
        AND ar.channel = 'auto_funnel'
    ) THEN
      code_value := substr(encode(gen_random_bytes(8), 'hex'), 1, 10);
      INSERT INTO public.affiliate_referrals (
        affiliate_id, broker_id, listing_id, tracking_code, channel, clicks,
        status, reward_type, reward_amount, settlement_status
      ) VALUES (
        NEW.user_id,
        COALESCE(listing_row.workspace_owner_id, listing_row.user_id),
        listing_row.id,
        code_value,
        'auto_funnel',
        0,
        'promoting',
        COALESCE(listing_row.affiliate_reward_type, 'fixed'),
        COALESCE(listing_row.affiliate_reward_amount, 0),
        'unsettled'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_affiliate_funnel_on_enable ON public.affiliate_profiles;
CREATE TRIGGER trg_backfill_affiliate_funnel_on_enable
AFTER INSERT OR UPDATE OF auto_funnel_enabled ON public.affiliate_profiles
FOR EACH ROW
EXECUTE FUNCTION public.backfill_affiliate_funnel_on_enable();

REVOKE ALL ON FUNCTION public.backfill_affiliate_funnel_on_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_affiliate_funnel_on_enable() FROM anon;
REVOKE ALL ON FUNCTION public.backfill_affiliate_funnel_on_enable() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_affiliate_funnel_on_enable() TO service_role;