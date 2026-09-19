REVOKE ALL ON FUNCTION public.notify_affiliate_referral_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_affiliate_referral_status_change() TO service_role;