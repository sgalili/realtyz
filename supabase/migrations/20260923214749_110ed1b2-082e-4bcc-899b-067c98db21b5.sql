CREATE OR REPLACE FUNCTION public.track_affiliate_click(_code text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.affiliate_referrals
     SET clicks = clicks + 1,
         status = CASE WHEN status = 'promoting' THEN 'clicked' ELSE status END
   WHERE tracking_code = _code;
$$;
GRANT EXECUTE ON FUNCTION public.track_affiliate_click(text) TO anon, authenticated;

GRANT DELETE ON public.affiliate_referrals TO authenticated;
CREATE POLICY "affiliates delete own referrals" ON public.affiliate_referrals
  FOR DELETE TO authenticated USING (affiliate_id = auth.uid());
CREATE POLICY "brokers delete workspace referrals" ON public.affiliate_referrals
  FOR DELETE TO authenticated USING (public.can_access_workspace_owner(broker_id));