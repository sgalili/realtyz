REVOKE ALL ON FUNCTION public.record_affiliate_click_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_click_event() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_private_owner_listing_limit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_private_owner_listing_limit() TO service_role;