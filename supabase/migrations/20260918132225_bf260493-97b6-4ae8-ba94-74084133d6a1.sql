REVOKE ALL ON FUNCTION public.auto_add_affiliate_listing_to_funnels() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_add_affiliate_listing_to_funnels() FROM anon;
REVOKE ALL ON FUNCTION public.auto_add_affiliate_listing_to_funnels() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_add_affiliate_listing_to_funnels() TO service_role;