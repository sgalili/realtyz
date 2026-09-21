ALTER FUNCTION public.get_lead_price_recommendation(text,text) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.get_lead_price_recommendation(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lead_price_recommendation(text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lead_price_recommendation(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_price_recommendation(text,text) TO service_role;