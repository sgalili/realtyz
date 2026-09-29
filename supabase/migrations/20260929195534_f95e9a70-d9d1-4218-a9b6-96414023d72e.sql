CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _owner uuid := public.current_workspace_owner(); _wallet uuid; _balance numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  _wallet := public.ensure_credit_wallet(_owner);
  SELECT balance_ils INTO _balance FROM public.credit_wallets WHERE id = _wallet;
  RETURN jsonb_build_object('wallet_id', _wallet, 'balance_ils', _balance);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_subscription_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid := public.current_workspace_owner();
  _sub public.user_subscriptions;
  _plan public.plans;
  _contacts int;
  _balance numeric;
  _promo record;
BEGIN
  IF _uid IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  SELECT * INTO _sub FROM public.user_subscriptions WHERE user_id = _owner ORDER BY created_at LIMIT 1;
  IF _sub.plan_id IS NOT NULL THEN SELECT * INTO _plan FROM public.plans WHERE id = _sub.plan_id; END IF;
  IF _plan.id IS NULL THEN SELECT * INTO _plan FROM public.plans WHERE name = 'free'; END IF;
  SELECT count(*) INTO _contacts FROM public.leads WHERE workspace_owner_id = _owner AND coalesce(is_demo,false) = false;
  PERFORM public.ensure_credit_wallet(_owner);
  SELECT balance_ils INTO _balance FROM public.credit_wallets WHERE user_id = _owner;
  SELECT claimed_count, max_slots INTO _promo FROM public.launch_promo_counter WHERE id = 1;
  RETURN jsonb_build_object(
    'plan', _plan.name,
    'plan_display_name', _plan.display_name,
    'monthly_price_ils', _plan.monthly_price_ils,
    'contact_limit', _plan.contact_limit,
    'contacts_used', _contacts,
    'status', coalesce(_sub.status, 'active'),
    'is_launch_promo', coalesce(_sub.is_launch_promo, false),
    'effective_price_ils', CASE WHEN coalesce(_sub.is_launch_promo,false) THEN _plan.monthly_price_ils/2 ELSE _plan.monthly_price_ils END,
    'current_period_end', _sub.current_period_end,
    'wallet_balance_ils', coalesce(_balance, 0),
    'promo_claimed', coalesce(_promo.claimed_count, 0),
    'promo_slots', coalesce(_promo.max_slots, 50),
    'promo_remaining', greatest(0, coalesce(_promo.max_slots,50) - coalesce(_promo.claimed_count,0))
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _owner uuid := public.current_workspace_owner(); _code text;
BEGIN
  IF _uid IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  SELECT referral_code INTO _code FROM public.profiles WHERE id = _owner;
  IF _code IS NULL OR btrim(_code) = '' THEN
    _code := public.gen_referral_code();
    UPDATE public.profiles SET referral_code = _code WHERE id = _owner;
  END IF;
  RETURN jsonb_build_object(
    'code', _code,
    'total', (SELECT count(*) FROM public.referrals WHERE referrer_id = _owner),
    'registered_free', (SELECT count(*) FROM public.referrals WHERE referrer_id = _owner AND status = 'registered_free'),
    'converted_paid', (SELECT count(*) FROM public.referrals WHERE referrer_id = _owner AND status = 'converted_paid'),
    'earned_ils', (SELECT coalesce(sum(amount_ils),0) FROM public.credit_transactions WHERE user_id = _owner AND type = 'referral_reward'),
    'referrals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'created_at', r.created_at, 'converted_at', r.converted_at,
      'name', coalesce(p.full_name, p.email)
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM public.referrals r LEFT JOIN public.profiles p ON p.id = r.referred_user_id
    WHERE r.referrer_id = _owner)
  );
END; $$;