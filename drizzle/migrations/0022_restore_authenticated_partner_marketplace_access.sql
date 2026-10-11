REVOKE ALL ON FUNCTION public.get_affiliate_marketplace_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace_v3() TO authenticated, service_role;