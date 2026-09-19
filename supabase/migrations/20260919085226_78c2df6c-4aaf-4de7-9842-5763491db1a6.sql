REVOKE ALL ON FUNCTION public.affiliate_tier3_eligible(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_affiliate_license(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_affiliate_license(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_affiliate_terms(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_affiliate_tier3_license() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.affiliate_tier3_eligible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_affiliate_license(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_affiliate_license(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_affiliate_terms(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_affiliate_tier3_license() TO service_role;