ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS contact_options jsonb NOT NULL DEFAULT '{"digital":true,"whatsapp":true,"phone":false,"questions":["מה סוג העסקה המבוקש?","מה התקציב שלך?","מתי תרצה להיכנס לנכס?"],"digital_price":0,"whatsapp_price":0,"phone_price":0}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_lead_price_recommendation(_deal_type text, _city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible AS (
    SELECT
      als.tier1_amount AS digital_price,
      als.tier2_amount AS verified_price
    FROM public.affiliate_lead_submissions als
    JOIN public.listings l ON l.id = als.listing_id
    WHERE public.ws_current_access(l.workspace_owner_id)
      AND (_deal_type IS NULL OR l.deal_type = _deal_type)
      AND (_city IS NULL OR btrim(_city) = '' OR l.city = _city)
      AND als.status IN ('verified','meeting','won')
  ), values_union AS (
    SELECT digital_price AS amount, 'digital'::text AS kind FROM accessible WHERE digital_price > 0
    UNION ALL
    SELECT verified_price AS amount, 'verified'::text AS kind FROM accessible WHERE verified_price > 0
  )
  SELECT jsonb_build_object(
    'digital', COALESCE((SELECT jsonb_build_object('median', percentile_disc(0.5) WITHIN GROUP (ORDER BY amount), 'low', percentile_disc(0.25) WITHIN GROUP (ORDER BY amount), 'high', percentile_disc(0.75) WITHIN GROUP (ORDER BY amount), 'samples', count(*)) FROM values_union WHERE kind='digital'), '{"samples":0}'::jsonb),
    'verified', COALESCE((SELECT jsonb_build_object('median', percentile_disc(0.5) WITHIN GROUP (ORDER BY amount), 'low', percentile_disc(0.25) WITHIN GROUP (ORDER BY amount), 'high', percentile_disc(0.75) WITHIN GROUP (ORDER BY amount), 'samples', count(*)) FROM values_union WHERE kind='verified'), '{"samples":0}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_price_recommendation(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_price_recommendation(text,text) TO service_role;