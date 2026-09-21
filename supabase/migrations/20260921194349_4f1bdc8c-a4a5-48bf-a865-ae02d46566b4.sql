ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS affiliate_tier4_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS affiliate_tier4_amount numeric NOT NULL DEFAULT 0;

UPDATE public.listings
   SET affiliate_tier4_type = COALESCE(affiliate_tier3_type, 'fixed'),
       affiliate_tier4_amount = COALESCE(affiliate_tier3_amount, 0),
       affiliate_tier3_type = 'fixed',
       affiliate_tier3_amount = 0
 WHERE COALESCE(affiliate_tier3_amount, 0) > 0
   AND COALESCE(affiliate_tier4_amount, 0) = 0;

ALTER TABLE public.affiliate_lead_submissions
  ADD COLUMN IF NOT EXISTS tier4_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS tier4_amount numeric NOT NULL DEFAULT 0;

-- Level 4 (deal closing) is the licensed-only tier now.
CREATE OR REPLACE FUNCTION public.enforce_affiliate_tier3_license()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_id IS NOT NULL AND NOT public.affiliate_tier3_eligible(NEW.affiliate_id) THEN
    IF to_jsonb(NEW) ? 'tier4_amount' THEN
      NEW.tier4_amount := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.charge_lead_commission(
  _listing_id uuid,
  _tier integer,
  _affiliate_id uuid DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.listings;
  v_owner uuid;
  v_gross numeric := 0;
  v_questions jsonb;
  v_extra integer := 0;
  v_net numeric;
  v_platform numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id;
  IF l.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'listing_not_found');
  END IF;
  v_owner := COALESCE(l.workspace_owner_id, l.user_id);

  v_gross := CASE _tier
    WHEN 1 THEN COALESCE(l.affiliate_tier1_amount, 0)
    WHEN 2 THEN COALESCE(l.affiliate_tier2_amount, 0)
    WHEN 3 THEN COALESCE(l.affiliate_tier3_amount, 0)
    ELSE 0
  END;

  IF _tier IN (2, 3) THEN
    v_questions := CASE
      WHEN _tier = 2 THEN COALESCE(l.contact_options -> 'questions', '[]'::jsonb)
      ELSE COALESCE(l.contact_options -> 'questions_phone', l.contact_options -> 'questions', '[]'::jsonb)
    END;
    IF jsonb_typeof(v_questions) = 'array' THEN
      v_extra := GREATEST(jsonb_array_length(v_questions) - 3, 0);
    END IF;
    v_gross := v_gross + (v_extra * 10);
  END IF;

  IF v_gross <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0);
  END IF;

  v_net := round(v_gross * 0.8);
  v_platform := v_gross - v_net;

  v_balance := public.add_credit(
    v_owner, -v_gross, 'affiliate_lead_charge', _reference_id,
    'עמלת ליד שותפים · שלב ' || _tier::text
  );

  IF _affiliate_id IS NOT NULL THEN
    PERFORM public.add_credit(
      _affiliate_id, v_net, 'affiliate_lead_reward', _reference_id,
      'תגמול ליד שותפים · שלב ' || _tier::text
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'charged', v_gross,
    'extra_questions', v_extra,
    'partner_net', v_net,
    'platform_fee', v_platform,
    'balance', v_balance,
    'locked', v_balance < 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_lead_commission(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_lead_commission(uuid, integer, uuid, uuid) TO service_role;