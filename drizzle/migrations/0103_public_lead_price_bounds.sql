CREATE OR REPLACE FUNCTION public.get_public_lead_price_bounds()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.partner_can_view_closing(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'form', jsonb_build_object('min', min(affiliate_tier1_amount) FILTER (WHERE affiliate_tier1_amount > 0), 'max', max(affiliate_tier1_amount) FILTER (WHERE affiliate_tier1_amount > 0)),
    'whatsapp', jsonb_build_object('min', min(affiliate_tier2_amount) FILTER (WHERE affiliate_tier2_amount > 0), 'max', max(affiliate_tier2_amount) FILTER (WHERE affiliate_tier2_amount > 0)),
    'phone', jsonb_build_object('min', min(affiliate_tier3_amount) FILTER (WHERE affiliate_tier3_amount > 0), 'max', max(affiliate_tier3_amount) FILTER (WHERE affiliate_tier3_amount > 0)))
  INTO r FROM public.listings
  WHERE is_published = true AND status <> 'discarded' AND asking_price > 0;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_public_lead_price_bounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_lead_price_bounds() TO authenticated;