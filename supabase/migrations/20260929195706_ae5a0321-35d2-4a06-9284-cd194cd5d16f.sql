CREATE POLICY "Active workspace members view usage_logs"
ON public.usage_logs FOR SELECT TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members view balance_adjustments"
ON public.balance_adjustments FOR SELECT TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members view credit_transactions"
ON public.credit_transactions FOR SELECT TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE OR REPLACE FUNCTION public.subscribe_to_plan(_plan_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid := public.current_workspace_owner();
  _plan public.plans;
  _promo boolean := false;
  _claimed int;
  _sub_id uuid;
  _ref public.referrals;
BEGIN
  IF _uid IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  SELECT * INTO _plan FROM public.plans WHERE name = lower(btrim(_plan_name));
  IF _plan.id IS NULL THEN RAISE EXCEPTION 'unknown plan %', _plan_name; END IF;

  IF _plan.monthly_price_ils > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE user_id = _owner AND is_launch_promo) THEN
      UPDATE public.launch_promo_counter
        SET claimed_count = claimed_count + 1, updated_at = now()
        WHERE id = 1 AND claimed_count < max_slots
        RETURNING claimed_count INTO _claimed;
      IF _claimed IS NOT NULL THEN _promo := true; END IF;
    ELSE
      _promo := true;
    END IF;
  END IF;

  SELECT id INTO _sub_id FROM public.user_subscriptions WHERE user_id = _owner ORDER BY created_at LIMIT 1;
  IF _sub_id IS NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, plan_name, status, is_launch_promo, current_period_start, current_period_end)
    VALUES (_owner, _plan.id, _plan.name, 'active', _promo, now(), now() + interval '30 days')
    RETURNING id INTO _sub_id;
  ELSE
    UPDATE public.user_subscriptions
    SET plan_id = _plan.id, plan_name = _plan.name, status = 'active',
        is_launch_promo = is_launch_promo OR _promo,
        current_period_start = now(), current_period_end = now() + interval '30 days', updated_at = now()
    WHERE id = _sub_id;
  END IF;

  UPDATE public.profiles
  SET plan_status = CASE WHEN _plan.monthly_price_ils > 0 THEN 'active' ELSE 'trial' END, updated_at = now()
  WHERE id = _owner;

  IF _promo AND _plan.monthly_price_ils > 0
     AND NOT EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id = _owner AND type = 'launch_bonus') THEN
    PERFORM public.add_credit(_owner, 15, 'launch_bonus', _sub_id, 'מתנת השקה');
  END IF;

  IF _plan.monthly_price_ils > 0 THEN
    SELECT * INTO _ref FROM public.referrals WHERE referred_user_id = _owner AND NOT reward_granted AND status <> 'void';
    IF _ref.id IS NOT NULL THEN
      UPDATE public.referrals SET status = 'converted_paid', reward_granted = true, converted_at = now() WHERE id = _ref.id;
      PERFORM public.add_credit(_ref.referrer_id, 50, 'referral_reward', _ref.id, 'תגמול הפניה');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'plan', _plan.name, 'monthly_price_ils', _plan.monthly_price_ils,
    'effective_price_ils', CASE WHEN _promo THEN _plan.monthly_price_ils / 2 ELSE _plan.monthly_price_ils END,
    'is_launch_promo', _promo, 'contact_limit', _plan.contact_limit
  );
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_my_subscription()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid := public.current_workspace_owner();
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  UPDATE public.user_subscriptions SET status = 'canceled', updated_at = now() WHERE user_id = _owner;
  UPDATE public.profiles SET plan_status = 'canceled', updated_at = now() WHERE id = _owner;
  RETURN jsonb_build_object('ok', true);
END; $$;