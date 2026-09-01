ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS affiliate_tier1_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_tier2_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_tier3_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS affiliate_tier3_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_affiliate_tier3_type_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_affiliate_tier3_type_check CHECK (affiliate_tier3_type IN ('fixed','percent'));

CREATE TABLE IF NOT EXISTS public.affiliate_lead_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL,
  broker_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_name text NOT NULL,
  lead_phone text,
  lead_email text,
  notes text,
  status text NOT NULL DEFAULT 'submitted',
  tier1_amount numeric NOT NULL DEFAULT 0,
  tier2_amount numeric NOT NULL DEFAULT 0,
  tier3_type text NOT NULL DEFAULT 'fixed',
  tier3_amount numeric NOT NULL DEFAULT 0,
  earned_amount numeric NOT NULL DEFAULT 0,
  settlement_status text NOT NULL DEFAULT 'unsettled',
  verified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_lead_submissions_status_check CHECK (status IN ('submitted','verified','closed','rejected')),
  CONSTRAINT affiliate_lead_submissions_tier3_type_check CHECK (tier3_type IN ('fixed','percent')),
  CONSTRAINT affiliate_lead_submissions_settlement_check CHECK (settlement_status IN ('unsettled','approved','paid'))
);

CREATE INDEX IF NOT EXISTS affiliate_lead_submissions_affiliate_idx ON public.affiliate_lead_submissions (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_lead_submissions_broker_idx ON public.affiliate_lead_submissions (broker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_lead_submissions_listing_idx ON public.affiliate_lead_submissions (listing_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_lead_submissions TO authenticated;
GRANT ALL ON public.affiliate_lead_submissions TO service_role;

ALTER TABLE public.affiliate_lead_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliates read own submissions"
  ON public.affiliate_lead_submissions FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.can_access_workspace_owner(broker_id));

CREATE POLICY "affiliates create own submissions"
  ON public.affiliate_lead_submissions FOR INSERT TO authenticated
  WITH CHECK (
    affiliate_id = auth.uid()
    AND status = 'submitted'
    AND settlement_status = 'unsettled'
    AND earned_amount = 0
    AND verified_at IS NULL
    AND closed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_id AND l.user_id = broker_id AND l.affiliate_enabled = true
    )
  );

CREATE POLICY "brokers update submissions on their listings"
  ON public.affiliate_lead_submissions FOR UPDATE TO authenticated
  USING (public.can_access_workspace_owner(broker_id))
  WITH CHECK (public.can_access_workspace_owner(broker_id));

CREATE POLICY "brokers delete submissions on their listings"
  ON public.affiliate_lead_submissions FOR DELETE TO authenticated
  USING (public.can_access_workspace_owner(broker_id));

CREATE TRIGGER affiliate_lead_submissions_touch
  BEFORE UPDATE ON public.affiliate_lead_submissions
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP FUNCTION IF EXISTS public.get_affiliate_marketplace();
CREATE FUNCTION public.get_affiliate_marketplace()
RETURNS TABLE(listing_id uuid, broker_id uuid, property_title text, address text, city text, deal_type text, rooms numeric, asking_price numeric, image_url text, media_photos jsonb, slug text, reward_type text, reward_amount numeric, approved_at timestamp with time zone, tier1_amount numeric, tier2_amount numeric, tier3_type text, tier3_amount numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.id, l.user_id, l.property_title, l.address, l.city, l.deal_type,
         l.rooms, l.asking_price, l.image_url, l.media_photos, l.slug,
         l.affiliate_reward_type, l.affiliate_reward_amount, l.affiliate_approved_at,
         l.affiliate_tier1_amount, l.affiliate_tier2_amount,
         l.affiliate_tier3_type, l.affiliate_tier3_amount
  FROM public.listings l
  WHERE l.affiliate_enabled = true
    AND COALESCE(l.status, 'live') = 'live'
    AND public.is_affiliate(auth.uid())
  ORDER BY l.affiliate_approved_at DESC NULLS LAST, l.created_at DESC
$function$;