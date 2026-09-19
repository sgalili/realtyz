ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS tier1_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier2_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier3_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS tier3_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.affiliate_share_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL,
  broker_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  message text NOT NULL,
  short_url text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  delivery_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_share_deliveries TO authenticated;
GRANT ALL ON public.affiliate_share_deliveries TO service_role;
ALTER TABLE public.affiliate_share_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliates view own share deliveries"
ON public.affiliate_share_deliveries FOR SELECT TO authenticated
USING (affiliate_id = auth.uid());
CREATE POLICY "Brokers view workspace share deliveries"
ON public.affiliate_share_deliveries FOR SELECT TO authenticated
USING (public.can_access_workspace_owner(broker_id));
CREATE INDEX affiliate_share_deliveries_affiliate_created_idx
  ON public.affiliate_share_deliveries (affiliate_id, created_at DESC);
CREATE INDEX affiliate_share_deliveries_referral_idx
  ON public.affiliate_share_deliveries (referral_id);
CREATE INDEX affiliate_share_deliveries_listing_idx
  ON public.affiliate_share_deliveries (listing_id);
CREATE TRIGGER affiliate_share_deliveries_touch_updated_at
BEFORE UPDATE ON public.affiliate_share_deliveries
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.preserve_affiliate_approved_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_enabled IS TRUE AND COALESCE(OLD.affiliate_enabled, FALSE) IS FALSE THEN
    NEW.affiliate_approved_at := now();
  ELSIF NEW.affiliate_enabled IS TRUE AND OLD.affiliate_enabled IS TRUE THEN
    NEW.affiliate_approved_at := OLD.affiliate_approved_at;
  ELSIF NEW.affiliate_enabled IS FALSE THEN
    NEW.affiliate_approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS preserve_affiliate_approved_at_trigger ON public.listings;
CREATE TRIGGER preserve_affiliate_approved_at_trigger
BEFORE UPDATE OF affiliate_enabled, affiliate_approved_at ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.preserve_affiliate_approved_at();

CREATE OR REPLACE FUNCTION public.notify_affiliate_referral_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_label text;
  status_label text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(property_title, address, 'נכס') INTO listing_label
  FROM public.listings WHERE id = NEW.listing_id;
  status_label := CASE NEW.status
    WHEN 'clicked' THEN 'נכנסו לקישור'
    WHEN 'lead_captured' THEN 'נקלטו פרטי איש קשר'
    WHEN 'qualified' THEN 'איש הקשר אומת'
    WHEN 'tour_scheduled' THEN 'נקבע סיור'
    WHEN 'deal_signed' THEN 'העסקה נחתמה'
    WHEN 'lost' THEN 'הפנייה נסגרה ללא עסקה'
    ELSE NEW.status
  END;
  INSERT INTO public.notifications (user_id, lead_id, event_type, title, body, deep_link, channel)
  VALUES (
    NEW.affiliate_id,
    NEW.lead_id,
    'affiliate_referral_status',
    'עדכון משיווק שותפים',
    status_label || ' · ' || COALESCE(listing_label, 'נכס'),
    '/affiliate-network?tab=tracking&referral=' || NEW.id::text,
    'in_app'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_affiliate_referral_status_change_trigger ON public.affiliate_referrals;
CREATE TRIGGER notify_affiliate_referral_status_change_trigger
AFTER UPDATE OF status ON public.affiliate_referrals
FOR EACH ROW EXECUTE FUNCTION public.notify_affiliate_referral_status_change();