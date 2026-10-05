ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS daily_lead_cap integer CHECK (daily_lead_cap IS NULL OR daily_lead_cap > 0);
ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS leftover_discount_type text NOT NULL DEFAULT 'percent' CHECK (leftover_discount_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS leftover_discount_value numeric NOT NULL DEFAULT 0 CHECK (leftover_discount_value >= 0);

CREATE TABLE IF NOT EXISTS public.listing_lead_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  workspace_owner_id uuid NOT NULL,
  affiliate_id uuid,
  tier integer NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  is_leftover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_lead_charges_listing_time ON public.listing_lead_charges (listing_id, created_at DESC);
GRANT ALL ON public.listing_lead_charges TO service_role;
ALTER TABLE public.listing_lead_charges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.listing_daily_cap_reached(_listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT l.daily_lead_cap IS NOT NULL AND (
      SELECT count(*) FROM public.listing_lead_charges c
      WHERE c.listing_id = l.id AND NOT c.is_leftover AND c.created_at > now() - interval '24 hours'
    ) >= l.daily_lead_cap
    FROM public.listings l WHERE l.id = _listing_id
  ), false)
$$;
REVOKE ALL ON FUNCTION public.listing_daily_cap_reached(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_daily_cap_reached(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.charge_lead_commission(
  _listing_id uuid, _tier integer, _affiliate_id uuid DEFAULT NULL, _reference_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.listings; v_owner uuid; v_gross numeric := 0; v_questions jsonb; v_extra integer := 0;
  v_net numeric; v_platform numeric; v_balance numeric;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'listing_not_found'); END IF;
  v_owner := COALESCE(l.workspace_owner_id, l.user_id);

  v_gross := CASE _tier WHEN 1 THEN COALESCE(l.affiliate_tier1_amount, 0)
    WHEN 2 THEN COALESCE(l.affiliate_tier2_amount, 0) WHEN 3 THEN COALESCE(l.affiliate_tier3_amount, 0) ELSE 0 END;
  IF _tier IN (2, 3) THEN
    v_questions := CASE WHEN _tier = 2 THEN COALESCE(l.contact_options -> 'questions', '[]'::jsonb)
      ELSE COALESCE(l.contact_options -> 'questions_phone', l.contact_options -> 'questions', '[]'::jsonb) END;
    IF jsonb_typeof(v_questions) = 'array' THEN v_extra := GREATEST(jsonb_array_length(v_questions) - 3, 0); END IF;
    v_gross := v_gross + (v_extra * 10);
  END IF;

  -- Daily cap: leads past the cap are kept as optional "leftover" leads, never charged.
  IF public.listing_daily_cap_reached(_listing_id) THEN
    INSERT INTO public.listing_lead_charges (listing_id, workspace_owner_id, affiliate_id, tier, gross, is_leftover)
    VALUES (l.id, v_owner, _affiliate_id, _tier, v_gross, true);
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'leftover', true);
  END IF;

  INSERT INTO public.listing_lead_charges (listing_id, workspace_owner_id, affiliate_id, tier, gross, is_leftover)
  VALUES (l.id, v_owner, _affiliate_id, _tier, v_gross, false);

  IF v_gross <= 0 THEN RETURN jsonb_build_object('ok', true, 'charged', 0); END IF;
  v_net := round(v_gross * 0.8); v_platform := v_gross - v_net;
  v_balance := public.add_credit(v_owner, -v_gross, 'affiliate_lead_charge', _reference_id, 'עמלת ליד שותפים · שלב ' || _tier::text);
  IF _affiliate_id IS NOT NULL THEN
    PERFORM public.add_credit(_affiliate_id, v_net, 'affiliate_lead_reward', _reference_id, 'תגמול ליד שותפים · שלב ' || _tier::text);
  END IF;
  RETURN jsonb_build_object('ok', true, 'charged', v_gross, 'extra_questions', v_extra, 'partner_net', v_net,
    'platform_fee', v_platform, 'balance', v_balance, 'locked', v_balance < 0);
END;
$$;
REVOKE ALL ON FUNCTION public.charge_lead_commission(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_lead_commission(uuid, integer, uuid, uuid) TO service_role;