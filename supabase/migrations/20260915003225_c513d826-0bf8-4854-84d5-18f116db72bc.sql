DROP FUNCTION IF EXISTS public.share_market_listings(timestamptz, integer);

-- Cities covered by the shared pool, with row counts — used by the app to show
-- every workspace which of its markets already have fresh inventory.
CREATE OR REPLACE FUNCTION public.market_pool_coverage(_since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS TABLE(city text, deal_type text, listings integer, newest_published_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ml.city,
         ml.deal_type,
         count(*)::int,
         max(ml.published_at)
    FROM public.market_listings ml
   WHERE ml.city IS NOT NULL
     AND ml.last_seen_at >= _since
   GROUP BY ml.city, ml.deal_type
   ORDER BY count(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.market_pool_coverage(timestamptz) TO authenticated, service_role;
