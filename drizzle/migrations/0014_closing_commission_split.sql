CREATE TABLE public.lead_closing_splits (
  submission_id uuid PRIMARY KEY REFERENCES public.affiliate_lead_submissions(id) ON DELETE CASCADE,
  lead_id uuid,
  affiliate_id uuid NOT NULL,
  workspace_owner_id uuid NOT NULL,
  partner_is_licensed boolean NOT NULL,
  commission_amount numeric NOT NULL DEFAULT 0,
  partner_pct numeric NOT NULL,
  partner_amount numeric NOT NULL DEFAULT 0,
  platform_amount numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_closing_splits TO authenticated;
GRANT ALL ON public.lead_closing_splits TO service_role;
ALTER TABLE public.lead_closing_splits ENABLE ROW LEVEL SECURITY;
-- Workspace sees its own deals; a partner sees the split only when holding a verified broker license.
CREATE POLICY "workspace reads closing splits" ON public.lead_closing_splits FOR SELECT TO authenticated
  USING (public.ws_current_access(workspace_owner_id));
CREATE POLICY "licensed partner reads own split" ON public.lead_closing_splits FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() AND partner_is_licensed AND EXISTS (
    SELECT 1 FROM public.affiliate_profiles ap WHERE ap.user_id = auth.uid() AND ap.license_status = 'verified'));

CREATE OR REPLACE FUNCTION public.compute_closing_split(_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; lic boolean; amt numeric; pct numeric;
BEGIN
  SELECT * INTO s FROM affiliate_lead_submissions WHERE id = _submission_id;
  IF s IS NULL OR s.status <> 'closed' THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM affiliate_profiles WHERE user_id = s.affiliate_id AND license_status = 'verified') INTO lic;
  SELECT coalesce(l.commission_amount, 0) INTO amt FROM leads l WHERE l.id = s.lead_id;
  amt := coalesce(amt, 0);
  pct := CASE WHEN lic THEN 80 ELSE 0 END;
  INSERT INTO lead_closing_splits (submission_id, lead_id, affiliate_id, workspace_owner_id, partner_is_licensed, commission_amount, partner_pct, partner_amount, platform_amount, computed_at)
  VALUES (s.id, s.lead_id, s.affiliate_id, s.broker_id, lic, amt, pct, round(amt * pct / 100, 2), round(amt * (100 - pct) / 100, 2), now())
  ON CONFLICT (submission_id) DO UPDATE SET partner_is_licensed = EXCLUDED.partner_is_licensed, commission_amount = EXCLUDED.commission_amount,
    partner_pct = EXCLUDED.partner_pct, partner_amount = EXCLUDED.partner_amount, platform_amount = EXCLUDED.platform_amount, computed_at = now();
  INSERT INTO audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'closing_split_computed', jsonb_build_object('submission_id', s.id, 'licensed', lic, 'commission', amt, 'partner_pct', pct));
END $$;
REVOKE ALL ON FUNCTION public.compute_closing_split(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_submission_closing_split() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' THEN PERFORM compute_closing_split(NEW.id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER submission_closing_split AFTER INSERT OR UPDATE OF status ON public.affiliate_lead_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_submission_closing_split();

CREATE OR REPLACE FUNCTION public.trg_lead_commission_split() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM affiliate_lead_submissions WHERE lead_id = NEW.id AND status = 'closed' LOOP
    PERFORM compute_closing_split(r.id);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER lead_commission_split AFTER UPDATE OF commission_amount ON public.leads
  FOR EACH ROW WHEN (OLD.commission_amount IS DISTINCT FROM NEW.commission_amount)
  EXECUTE FUNCTION public.trg_lead_commission_split();

SELECT public.compute_closing_split(id) FROM public.affiliate_lead_submissions WHERE status = 'closed';