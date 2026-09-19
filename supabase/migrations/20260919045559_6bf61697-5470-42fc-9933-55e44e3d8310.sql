REVOKE ALL ON FUNCTION public.select_my_affiliate_plan(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.select_my_affiliate_plan(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.register_as_property_owner(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_as_property_owner(text) TO authenticated;

REVOKE ALL ON FUNCTION public.register_as_property_seeker(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_as_property_seeker(text) TO authenticated;

REVOKE ALL ON FUNCTION public.enforce_affiliate_contact_limit() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_affiliate_reward_split() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_private_owner_listing_limit() FROM public, anon, authenticated;