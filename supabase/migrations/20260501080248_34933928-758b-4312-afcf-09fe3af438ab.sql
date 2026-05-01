-- Partner brokers (Udi's network of referral partners)
CREATE TABLE public.partner_brokers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  agency TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_brokers_user ON public.partner_brokers(user_id);

ALTER TABLE public.partner_brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own partner_brokers"
ON public.partner_brokers FOR ALL TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_partner_brokers_updated_at
BEFORE UPDATE ON public.partner_brokers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Broker referrals (shared deals, sent + received)
CREATE TABLE public.broker_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Sender (the local user who initiated the referral)
  sender_user_id UUID NOT NULL,
  -- Optional internal recipient (if the partner is also a Realtyz user)
  recipient_user_id UUID,
  -- Partner record (from sender's address book) when sending out
  partner_broker_id UUID REFERENCES public.partner_brokers(id) ON DELETE SET NULL,
  -- Snapshot of partner contact at send time
  partner_name TEXT NOT NULL,
  partner_email TEXT,
  partner_phone TEXT,
  -- Subject of the referral
  lead_id UUID,
  listing_id UUID,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('lead','listing','other')),
  subject_label TEXT NOT NULL,
  -- Direction & lifecycle
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_negotiation','closed_won','closed_lost','cancelled')),
  -- Body sent to partner
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','manual')),
  message_body TEXT,
  -- Optional commission split (percentage to partner, 0-100)
  commission_split_pct NUMERIC,
  -- Delivery metadata
  delivery_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued','sent','failed','manual')),
  delivery_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  responded_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_broker_referrals_sender ON public.broker_referrals(sender_user_id);
CREATE INDEX idx_broker_referrals_recipient ON public.broker_referrals(recipient_user_id);
CREATE INDEX idx_broker_referrals_lead ON public.broker_referrals(lead_id);
CREATE INDEX idx_broker_referrals_listing ON public.broker_referrals(listing_id);
CREATE INDEX idx_broker_referrals_status ON public.broker_referrals(status);

ALTER TABLE public.broker_referrals ENABLE ROW LEVEL SECURITY;

-- Sender owns the row; internal recipient (if linked) can read & update status
CREATE POLICY "Sender manages own broker_referrals"
ON public.broker_referrals FOR ALL TO authenticated
USING (sender_user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (sender_user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Recipient reads broker_referrals"
ON public.broker_referrals FOR SELECT TO authenticated
USING (recipient_user_id = auth.uid());

CREATE POLICY "Recipient updates status of broker_referrals"
ON public.broker_referrals FOR UPDATE TO authenticated
USING (recipient_user_id = auth.uid())
WITH CHECK (recipient_user_id = auth.uid());

CREATE TRIGGER trg_broker_referrals_updated_at
BEFORE UPDATE ON public.broker_referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set closed_at when status enters terminal state
CREATE OR REPLACE FUNCTION public.set_broker_referral_closed_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('closed_won','closed_lost','cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broker_referrals_closed_at
BEFORE UPDATE ON public.broker_referrals
FOR EACH ROW EXECUTE FUNCTION public.set_broker_referral_closed_at();