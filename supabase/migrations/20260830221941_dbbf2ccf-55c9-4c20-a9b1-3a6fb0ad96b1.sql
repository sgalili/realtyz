-- 1. Broker-set reward fields on listings ------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS affiliate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliate_reward_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS affiliate_reward_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_approved_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_affiliate_reward_type_check'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_affiliate_reward_type_check
      CHECK (affiliate_reward_type IN ('fixed', 'percent'));
  END IF;
END $$;

-- 2. Role helper --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_affiliate(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'affiliate'::public.app_role
  )
$$;

REVOKE ALL ON FUNCTION public.is_affiliate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_affiliate(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_affiliate(uuid) TO authenticated, service_role;

-- 3. Affiliate profiles -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_profiles (
  user_id uuid PRIMARY KEY,
  display_name text,
  phone text,
  payout_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.affiliate_profiles TO authenticated;
GRANT ALL ON public.affiliate_profiles TO service_role;
ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliates manage own profile" ON public.affiliate_profiles;
CREATE POLICY "affiliates manage own profile"
  ON public.affiliate_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Referrals ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL,
  broker_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  tracking_code text NOT NULL UNIQUE,
  channel text,
  clicks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'promoting',
  reward_type text NOT NULL DEFAULT 'fixed',
  reward_amount numeric NOT NULL DEFAULT 0,
  settlement_status text NOT NULL DEFAULT 'unsettled',
  settled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_referrals_status_check
    CHECK (status IN ('promoting', 'clicked', 'lead_captured', 'qualified', 'tour_scheduled', 'deal_signed', 'lost')),
  CONSTRAINT affiliate_referrals_reward_type_check
    CHECK (reward_type IN ('fixed', 'percent')),
  CONSTRAINT affiliate_referrals_settlement_check
    CHECK (settlement_status IN ('unsettled', 'approved', 'paid'))
);

CREATE INDEX IF NOT EXISTS affiliate_referrals_affiliate_idx ON public.affiliate_referrals (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_referrals_broker_idx ON public.affiliate_referrals (broker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_referrals_listing_idx ON public.affiliate_referrals (listing_id);

GRANT SELECT, INSERT, UPDATE ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliates read own referrals" ON public.affiliate_referrals;
CREATE POLICY "affiliates read own referrals"
  ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid());

DROP POLICY IF EXISTS "affiliates create own referrals" ON public.affiliate_referrals;
CREATE POLICY "affiliates create own referrals"
  ON public.affiliate_referrals FOR INSERT TO authenticated
  WITH CHECK (
    affiliate_id = auth.uid()
    AND status = 'promoting'
    AND settlement_status = 'unsettled'
    AND settled_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = affiliate_referrals.listing_id
        AND l.affiliate_enabled = true
        AND l.user_id = affiliate_referrals.broker_id
        AND l.affiliate_reward_type = affiliate_referrals.reward_type
        AND l.affiliate_reward_amount = affiliate_referrals.reward_amount
    )
  );

DROP POLICY IF EXISTS "brokers read workspace referrals" ON public.affiliate_referrals;
CREATE POLICY "brokers read workspace referrals"
  ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (public.can_access_workspace_owner(broker_id));

DROP POLICY IF EXISTS "brokers update workspace referrals" ON public.affiliate_referrals;
CREATE POLICY "brokers update workspace referrals"
  ON public.affiliate_referrals FOR UPDATE TO authenticated
  USING (public.can_access_workspace_owner(broker_id))
  WITH CHECK (public.can_access_workspace_owner(broker_id));

-- 4b. Broker read access to the affiliate profiles behind their referrals ----
DROP POLICY IF EXISTS "brokers read affiliate profiles of their referrals" ON public.affiliate_profiles;
CREATE POLICY "brokers read affiliate profiles of their referrals"
  ON public.affiliate_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_referrals r
      WHERE r.affiliate_id = affiliate_profiles.user_id
        AND public.can_access_workspace_owner(r.broker_id)
    )
  );

-- 5. Self-service affiliate registration (grants ONLY the affiliate role) -----
CREATE OR REPLACE FUNCTION public.register_as_affiliate(_display_name text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'affiliate'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.affiliate_profiles (user_id, display_name, phone)
  VALUES (_uid, _display_name, _phone)
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, affiliate_profiles.display_name),
        phone        = COALESCE(EXCLUDED.phone, affiliate_profiles.phone),
        updated_at   = now();

  RETURN jsonb_build_object('ok', true, 'user_id', _uid);
END;
$$;

REVOKE ALL ON FUNCTION public.register_as_affiliate(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_as_affiliate(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_as_affiliate(text, text) TO authenticated;

-- 6. Affiliate marketplace (whitelisted public columns only) ------------------
CREATE OR REPLACE FUNCTION public.get_affiliate_marketplace()
RETURNS TABLE (
  listing_id uuid,
  broker_id uuid,
  property_title text,
  address text,
  city text,
  deal_type text,
  rooms numeric,
  asking_price numeric,
  image_url text,
  media_photos jsonb,
  slug text,
  reward_type text,
  reward_amount numeric,
  approved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.user_id, l.property_title, l.address, l.city, l.deal_type,
         l.rooms, l.asking_price, l.image_url, l.media_photos, l.slug,
         l.affiliate_reward_type, l.affiliate_reward_amount, l.affiliate_approved_at
  FROM public.listings l
  WHERE l.affiliate_enabled = true
    AND COALESCE(l.status, 'live') = 'live'
    AND public.is_affiliate(auth.uid())
  ORDER BY l.affiliate_approved_at DESC NULLS LAST, l.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_marketplace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_affiliate_marketplace() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_affiliate_marketplace() TO authenticated;

-- 7. updated_at triggers ------------------------------------------------------
DROP TRIGGER IF EXISTS affiliate_profiles_touch ON public.affiliate_profiles;
CREATE TRIGGER affiliate_profiles_touch
  BEFORE UPDATE ON public.affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS affiliate_referrals_touch ON public.affiliate_referrals;
CREATE TRIGGER affiliate_referrals_touch
  BEFORE UPDATE ON public.affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();