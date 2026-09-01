-- ============ PLANS ============
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (name IN ('free','agent','pro','max')),
  display_name TEXT NOT NULL,
  monthly_price_ils NUMERIC NOT NULL DEFAULT 0,
  contact_limit INTEGER NOT NULL DEFAULT 10,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans readable by everyone" ON public.plans;
CREATE POLICY "plans readable by everyone" ON public.plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "admins manage plans" ON public.plans;
CREATE POLICY "admins manage plans" ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.plans (name, display_name, monthly_price_ils, contact_limit, sort_order) VALUES
  ('free','חינם',0,10,0),
  ('agent','Agent',145,250,1),
  ('pro','Pro',495,1000,2),
  ('max','Max',795,5000,3)
ON CONFLICT (name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      monthly_price_ils = EXCLUDED.monthly_price_ils,
      contact_limit = EXCLUDED.contact_limit,
      sort_order = EXCLUDED.sort_order;

-- ============ SUBSCRIPTIONS ============
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS is_launch_promo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- ============ CREDIT WALLETS ============
CREATE TABLE IF NOT EXISTS public.credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance_ils NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_wallets TO authenticated;
GRANT ALL ON public.credit_wallets TO service_role;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own wallet" ON public.credit_wallets;
CREATE POLICY "own wallet" ON public.credit_wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.credit_wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount_ils NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('launch_bonus','referral_reward','manual_adjustment','usage_deduction','topup')),
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_transactions_user_idx ON public.credit_transactions(user_id, created_at DESC);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own transactions" ON public.credit_transactions;
CREATE POLICY "own transactions" ON public.credit_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============ REFERRALS ============
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL,
  referred_user_id UUID NOT NULL UNIQUE,
  referral_code TEXT,
  status TEXT NOT NULL DEFAULT 'registered_free' CHECK (status IN ('registered_free','converted_paid','void')),
  reward_granted BOOLEAN NOT NULL DEFAULT false,
  fraud_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_id, created_at DESC);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own referrals" ON public.referrals;
CREATE POLICY "own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_user_id = auth.uid()
         OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============ LAUNCH PROMO COUNTER ============
CREATE TABLE IF NOT EXISTS public.launch_promo_counter (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0 AND claimed_count <= 50),
  max_slots INTEGER NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.launch_promo_counter (id, claimed_count) VALUES (1,0) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.launch_promo_counter TO anon, authenticated;
GRANT ALL ON public.launch_promo_counter TO service_role;
ALTER TABLE public.launch_promo_counter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promo counter readable" ON public.launch_promo_counter;
CREATE POLICY "promo counter readable" ON public.launch_promo_counter FOR SELECT USING (true);
DROP POLICY IF EXISTS "admins update promo counter" ON public.launch_promo_counter;
CREATE POLICY "admins update promo counter" ON public.launch_promo_counter FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============ REFERRAL CODES ON PROFILES ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles(referral_code) WHERE referral_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE _code TEXT; _tries INT := 0;
BEGIN
  LOOP
    _code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,7));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = _code);
    _tries := _tries + 1;
    IF _tries > 20 THEN RAISE EXCEPTION 'could not generate referral code'; END IF;
  END LOOP;
  RETURN _code;
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_referral_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT referral_code INTO _code FROM public.profiles WHERE id = auth.uid();
  IF _code IS NULL THEN
    _code := public.gen_referral_code();
    UPDATE public.profiles SET referral_code = _code WHERE id = auth.uid();
  END IF;
  RETURN _code;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_referral_code() TO authenticated;

-- ============ WALLET HELPERS ============
CREATE OR REPLACE FUNCTION public.ensure_credit_wallet(_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  SELECT id INTO _id FROM public.credit_wallets WHERE user_id = _user_id;
  IF _id IS NULL THEN
    INSERT INTO public.credit_wallets (user_id) VALUES (_user_id)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
      RETURNING id INTO _id;
  END IF;
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.add_credit(_user_id UUID, _amount NUMERIC, _type TEXT, _reference_id UUID DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wallet UUID; _balance NUMERIC;
BEGIN
  _wallet := public.ensure_credit_wallet(_user_id);
  INSERT INTO public.credit_transactions (wallet_id, user_id, amount_ils, type, reference_id, note)
    VALUES (_wallet, _user_id, _amount, _type, _reference_id, _note);
  UPDATE public.credit_wallets SET balance_ils = balance_ils + _amount, updated_at = now()
    WHERE id = _wallet RETURNING balance_ils INTO _balance;
  RETURN _balance;
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wallet UUID; _balance NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _wallet := public.ensure_credit_wallet(auth.uid());
  SELECT balance_ils INTO _balance FROM public.credit_wallets WHERE id = _wallet;
  RETURN jsonb_build_object('wallet_id', _wallet, 'balance_ils', _balance);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_adjust_credit(_user_id UUID, _amount NUMERIC, _reason TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN public.add_credit(_user_id, _amount, 'manual_adjustment', auth.uid(), _reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credit(UUID, NUMERIC, TEXT) TO authenticated;

-- ============ REFERRAL ATTRIBUTION ============
CREATE OR REPLACE FUNCTION public.register_referral(_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _referrer UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_attributed');
  END IF;
  SELECT id INTO _referrer FROM public.profiles WHERE referral_code = upper(btrim(_code));
  IF _referrer IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code'); END IF;
  IF _referrer = auth.uid() THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_referral'); END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referral_code, status)
    VALUES (_referrer, auth.uid(), upper(btrim(_code)), 'registered_free')
    ON CONFLICT (referred_user_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'referrer_id', _referrer);
END; $$;
GRANT EXECUTE ON FUNCTION public.register_referral(TEXT) TO authenticated;

-- ============ SUBSCRIBE / LAUNCH PROMO ============
CREATE OR REPLACE FUNCTION public.subscribe_to_plan(_plan_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _plan public.plans;
  _promo BOOLEAN := false;
  _claimed INT;
  _sub_id UUID;
  _ref public.referrals;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _plan FROM public.plans WHERE name = lower(btrim(_plan_name));
  IF _plan.id IS NULL THEN RAISE EXCEPTION 'unknown plan %', _plan_name; END IF;

  IF _plan.monthly_price_ils > 0 THEN
    -- atomic launch slot claim
    IF NOT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE user_id = _uid AND is_launch_promo) THEN
      UPDATE public.launch_promo_counter
        SET claimed_count = claimed_count + 1, updated_at = now()
        WHERE id = 1 AND claimed_count < max_slots
        RETURNING claimed_count INTO _claimed;
      IF _claimed IS NOT NULL THEN _promo := true; END IF;
    ELSE
      _promo := true;
    END IF;
  END IF;

  SELECT id INTO _sub_id FROM public.user_subscriptions WHERE user_id = _uid ORDER BY created_at LIMIT 1;
  IF _sub_id IS NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, plan_name, status, is_launch_promo,
      current_period_start, current_period_end)
      VALUES (_uid, _plan.id, _plan.name, 'active', _promo, now(), now() + interval '30 days')
      RETURNING id INTO _sub_id;
  ELSE
    UPDATE public.user_subscriptions
      SET plan_id = _plan.id, plan_name = _plan.name, status = 'active',
          is_launch_promo = is_launch_promo OR _promo,
          current_period_start = now(), current_period_end = now() + interval '30 days',
          updated_at = now()
      WHERE id = _sub_id;
  END IF;

  UPDATE public.profiles
    SET plan_status = CASE WHEN _plan.monthly_price_ils > 0 THEN 'active' ELSE 'trial' END,
        updated_at = now()
    WHERE id = _uid;

  -- launch bonus 15 ILS (once)
  IF _promo AND _plan.monthly_price_ils > 0
     AND NOT EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id = _uid AND type = 'launch_bonus') THEN
    PERFORM public.add_credit(_uid, 15, 'launch_bonus', _sub_id, 'מתנת השקה');
  END IF;

  -- referral conversion 50 ILS to referrer (once)
  IF _plan.monthly_price_ils > 0 THEN
    SELECT * INTO _ref FROM public.referrals
      WHERE referred_user_id = _uid AND NOT reward_granted AND status <> 'void';
    IF _ref.id IS NOT NULL THEN
      UPDATE public.referrals
        SET status = 'converted_paid', reward_granted = true, converted_at = now()
        WHERE id = _ref.id;
      PERFORM public.add_credit(_ref.referrer_id, 50, 'referral_reward', _ref.id, 'תגמול הפניה');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', _plan.name,
    'monthly_price_ils', _plan.monthly_price_ils,
    'effective_price_ils', CASE WHEN _promo THEN _plan.monthly_price_ils / 2 ELSE _plan.monthly_price_ils END,
    'is_launch_promo', _promo,
    'contact_limit', _plan.contact_limit
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.subscribe_to_plan(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_my_subscription()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.user_subscriptions SET status = 'canceled', updated_at = now() WHERE user_id = auth.uid();
  UPDATE public.profiles SET plan_status = 'canceled', updated_at = now() WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_my_subscription() TO authenticated;

-- ============ MY STATUS ============
CREATE OR REPLACE FUNCTION public.get_my_subscription_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _sub public.user_subscriptions;
  _plan public.plans;
  _contacts INT;
  _balance NUMERIC;
  _promo RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _sub FROM public.user_subscriptions WHERE user_id = _uid ORDER BY created_at LIMIT 1;
  IF _sub.plan_id IS NOT NULL THEN
    SELECT * INTO _plan FROM public.plans WHERE id = _sub.plan_id;
  END IF;
  IF _plan.id IS NULL THEN SELECT * INTO _plan FROM public.plans WHERE name = 'free'; END IF;

  SELECT count(*) INTO _contacts FROM public.leads WHERE user_id = _uid AND coalesce(is_demo,false) = false;
  PERFORM public.ensure_credit_wallet(_uid);
  SELECT balance_ils INTO _balance FROM public.credit_wallets WHERE user_id = _uid;
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
GRANT EXECUTE ON FUNCTION public.get_my_subscription_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _code TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _code := public.get_my_referral_code();
  RETURN jsonb_build_object(
    'code', _code,
    'total', (SELECT count(*) FROM public.referrals WHERE referrer_id = _uid),
    'registered_free', (SELECT count(*) FROM public.referrals WHERE referrer_id = _uid AND status = 'registered_free'),
    'converted_paid', (SELECT count(*) FROM public.referrals WHERE referrer_id = _uid AND status = 'converted_paid'),
    'earned_ils', (SELECT coalesce(sum(amount_ils),0) FROM public.credit_transactions WHERE user_id = _uid AND type = 'referral_reward'),
    'referrals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'created_at', r.created_at, 'converted_at', r.converted_at,
        'name', coalesce(p.full_name, p.email)
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM public.referrals r LEFT JOIN public.profiles p ON p.id = r.referred_user_id
      WHERE r.referrer_id = _uid)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;

-- ============ CONTACT LIMIT ENFORCEMENT ============
CREATE OR REPLACE FUNCTION public.enforce_plan_contact_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit INT; _count INT; _unlimited BOOLEAN;
BEGIN
  IF NEW.user_id IS NULL OR coalesce(NEW.is_demo,false) THEN RETURN NEW; END IF;
  SELECT is_unlimited INTO _unlimited FROM public.profiles WHERE id = NEW.user_id;
  IF coalesce(_unlimited,false) THEN RETURN NEW; END IF;

  SELECT p.contact_limit INTO _limit
    FROM public.user_subscriptions s JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = NEW.user_id AND s.status = 'active'
    ORDER BY s.created_at LIMIT 1;
  IF _limit IS NULL THEN SELECT contact_limit INTO _limit FROM public.plans WHERE name = 'free'; END IF;

  SELECT count(*) INTO _count FROM public.leads
    WHERE user_id = NEW.user_id AND coalesce(is_demo,false) = false;
  IF _count >= _limit THEN
    RAISE EXCEPTION 'CONTACT_LIMIT_REACHED: הגעת למגבלת אנשי הקשר בחבילה (%). שדרג חבילה כדי להוסיף עוד.', _limit;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS enforce_plan_contact_limit_trg ON public.leads;
CREATE TRIGGER enforce_plan_contact_limit_trg
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_contact_limit();

-- ============ ADMIN ANALYTICS ============
CREATE OR REPLACE FUNCTION public.get_growth_analytics()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _promo RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT claimed_count, max_slots INTO _promo FROM public.launch_promo_counter WHERE id = 1;
  RETURN jsonb_build_object(
    'promo_claimed', coalesce(_promo.claimed_count,0),
    'promo_slots', coalesce(_promo.max_slots,50),
    'promo_remaining', greatest(0, coalesce(_promo.max_slots,50) - coalesce(_promo.claimed_count,0)),
    'referrals_total', (SELECT count(*) FROM public.referrals),
    'referrals_converted', (SELECT count(*) FROM public.referrals WHERE status = 'converted_paid'),
    'credits_launch_bonus', (SELECT coalesce(sum(amount_ils),0) FROM public.credit_transactions WHERE type = 'launch_bonus'),
    'credits_referral_reward', (SELECT coalesce(sum(amount_ils),0) FROM public.credit_transactions WHERE type = 'referral_reward'),
    'credits_manual', (SELECT coalesce(sum(amount_ils),0) FROM public.credit_transactions WHERE type = 'manual_adjustment'),
    'plan_distribution', (SELECT coalesce(jsonb_object_agg(pn, c), '{}'::jsonb) FROM (
        SELECT coalesce(p.name,'free') AS pn, count(*) AS c
        FROM public.user_subscriptions s LEFT JOIN public.plans p ON p.id = s.plan_id
        WHERE s.status = 'active' GROUP BY 1) x)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_growth_analytics() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_link_referral(_referrer UUID, _referred UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _referrer = _referred THEN RAISE EXCEPTION 'self referral not allowed'; END IF;
  INSERT INTO public.referrals (referrer_id, referred_user_id, status)
    VALUES (_referrer, _referred, 'registered_free')
    ON CONFLICT (referred_user_id) DO UPDATE SET referrer_id = EXCLUDED.referrer_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_link_referral(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unlink_referral(_referred UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  DELETE FROM public.referrals WHERE referred_user_id = _referred;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_unlink_referral(UUID) TO authenticated;

CREATE OR REPLACE TRIGGER credit_wallets_touch BEFORE UPDATE ON public.credit_wallets
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();