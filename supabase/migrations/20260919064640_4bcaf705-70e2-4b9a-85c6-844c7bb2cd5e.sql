REVOKE EXECUTE ON FUNCTION public.get_affiliate_marketplace_v3() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace_v3() TO service_role;