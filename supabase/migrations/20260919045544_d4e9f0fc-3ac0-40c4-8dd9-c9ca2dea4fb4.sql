ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'property_seeker';

CREATE TABLE public.affiliate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_he text NOT NULL,
  monthly_price_ils numeric NOT NULL CHECK (monthly_price_ils >= 0),
  contact_limit integer NOT NULL CHECK (contact_limit > 0),
  annual_paid_months integer NOT NULL DEFAULT 10 CHECK (annual_paid_months BETWEEN 1 AND 12),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_plans TO anon, authenticated;
GRANT ALL ON public.affiliate_plans TO service_role;
ALTER TABLE public.affiliate_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliate plans are publicly readable" ON public.affiliate_plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage affiliate plans" ON public.affiliate_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.affiliate_plans (slug, name_he, monthly_price_ils, contact_limit, annual_paid_months, sort_order) VALUES
  ('free', 'חינם', 0, 10, 10, 0),
  ('partner_100', '100', 49, 100, 10, 1),
  ('partner_1000', '1,000', 99, 1000, 10, 2),
  ('partner_2000', '2,000', 149, 2000, 10, 3)
ON CONFLICT (slug) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  monthly_price_ils = EXCLUDED.monthly_price_ils,
  contact_limit = EXCLUDED.contact_limit,
  annual_paid_months = EXCLUDED.annual_paid_months,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

ALTER TABLE public.affiliate_profiles
  ADD COLUMN IF NOT EXISTS plan_slug text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly';
ALTER TABLE public.affiliate_profiles DROP CONSTRAINT IF EXISTS affiliate_profiles_billing_period_check;
ALTER TABLE public.affiliate_profiles ADD CONSTRAINT affiliate_profiles_billing_period_check CHECK (billing_period IN ('monthly','annual'));

CREATE OR REPLACE FUNCTION public.select_my_affiliate_plan(_plan_slug text, _billing_period text DEFAULT 'monthly')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _plan public.affiliate_plans;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'affiliate') THEN
    RAISE EXCEPTION 'affiliate account required';
  END IF;
  SELECT * INTO _plan FROM public.affiliate_plans WHERE slug = _plan_slug AND is_active = true;
  IF _plan.id IS NULL THEN RAISE EXCEPTION 'unknown affiliate plan'; END IF;
  IF _billing_period NOT IN ('monthly','annual') THEN RAISE EXCEPTION 'invalid billing period'; END IF;
  INSERT INTO public.affiliate_profiles (user_id, plan_slug, billing_period)
  VALUES (auth.uid(), _plan.slug, _billing_period)
  ON CONFLICT (user_id) DO UPDATE SET plan_slug = EXCLUDED.plan_slug, billing_period = EXCLUDED.billing_period, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'plan_slug', _plan.slug, 'billing_period', _billing_period, 'contact_limit', _plan.contact_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.select_my_affiliate_plan(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_affiliate_contact_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _limit integer; _used integer;
BEGIN
  SELECT p.contact_limit INTO _limit
  FROM public.affiliate_profiles ap
  JOIN public.affiliate_plans p ON p.slug = ap.plan_slug AND p.is_active = true
  WHERE ap.user_id = NEW.affiliate_id;
  IF _limit IS NULL THEN _limit := 10; END IF;
  SELECT count(DISTINCT coalesce(nullif(lower(btrim(lead_email)),''), regexp_replace(coalesce(lead_phone,''),'\D','','g'), lower(btrim(lead_name))))
  INTO _used FROM public.affiliate_lead_submissions WHERE affiliate_id = NEW.affiliate_id;
  IF _used >= _limit THEN RAISE EXCEPTION 'affiliate contact limit reached'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_affiliate_contact_limit_trigger ON public.affiliate_lead_submissions;
CREATE TRIGGER enforce_affiliate_contact_limit_trigger BEFORE INSERT ON public.affiliate_lead_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_affiliate_contact_limit();

ALTER TABLE public.affiliate_lead_submissions
  ADD COLUMN IF NOT EXISTS realtyz_commission_rate numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS partner_net_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS realtyz_commission_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.affiliate_lead_submissions DROP CONSTRAINT IF EXISTS affiliate_submissions_realtyz_rate_check;
ALTER TABLE public.affiliate_lead_submissions ADD CONSTRAINT affiliate_submissions_realtyz_rate_check CHECK (realtyz_commission_rate = 20);

CREATE OR REPLACE FUNCTION public.calculate_affiliate_reward_split()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.realtyz_commission_rate := 20;
  NEW.realtyz_commission_amount := round(coalesce(NEW.earned_amount, 0) * 0.20, 2);
  NEW.partner_net_amount := round(coalesce(NEW.earned_amount, 0) * 0.80, 2);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS calculate_affiliate_reward_split_trigger ON public.affiliate_lead_submissions;
CREATE TRIGGER calculate_affiliate_reward_split_trigger BEFORE INSERT OR UPDATE OF earned_amount ON public.affiliate_lead_submissions
FOR EACH ROW EXECUTE FUNCTION public.calculate_affiliate_reward_split();

CREATE OR REPLACE FUNCTION public.register_as_property_owner(_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public.ensure_profile_row(auth.uid());
  IF nullif(btrim(_display_name), '') IS NOT NULL THEN
    UPDATE public.profiles SET full_name = coalesce(nullif(full_name,''), btrim(_display_name)), updated_at = now() WHERE id = auth.uid();
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'property_owner') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'role', 'property_owner');
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_as_property_owner(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_as_property_seeker(_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public.ensure_profile_row(auth.uid());
  IF nullif(btrim(_display_name), '') IS NOT NULL THEN
    UPDATE public.profiles SET full_name = coalesce(nullif(full_name,''), btrim(_display_name)), updated_at = now() WHERE id = auth.uid();
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'property_seeker') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'role', 'property_seeker');
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_as_property_seeker(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_private_owner_listing_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL
     AND public.has_role(NEW.owner_id, 'property_owner')
     AND NEW.status <> 'discarded'
     AND EXISTS (
       SELECT 1 FROM public.listings l
       WHERE l.owner_id = NEW.owner_id
         AND l.status <> 'discarded'
         AND l.id <> NEW.id
     ) THEN
    RAISE EXCEPTION 'private property owners may publish one active property';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_private_owner_listing_limit_trigger ON public.listings;
CREATE TRIGGER enforce_private_owner_listing_limit_trigger
BEFORE INSERT OR UPDATE OF owner_id, status ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_private_owner_listing_limit();

CREATE POLICY "Private owners create their one property" ON public.listings FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND user_id = auth.uid()
    AND workspace_owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'property_owner')
    AND is_published = true
    AND affiliate_enabled = true
  );