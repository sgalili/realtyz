REVOKE ALL ON public.grow_payment_settings,public.grow_payment_orders,public.grow_subscription_entitlements FROM anon;
REVOKE ALL ON public.grow_payment_orders,public.grow_subscription_entitlements FROM authenticated;
GRANT SELECT ON public.grow_payment_orders,public.grow_subscription_entitlements TO authenticated;
REVOKE ALL ON public.grow_payment_settings FROM authenticated;
GRANT SELECT,INSERT,UPDATE ON public.grow_payment_settings TO authenticated;
GRANT ALL ON public.grow_payment_settings,public.grow_payment_orders,public.grow_subscription_entitlements TO service_role;