-- 1. Reward snapshots (immutable)
CREATE TABLE public.listing_reward_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  affiliate_id uuid NOT NULL,
  referral_id uuid,
  workspace_owner_id uuid,
  tier1_amount numeric NOT NULL DEFAULT 0,
  tier2_amount numeric NOT NULL DEFAULT 0,
  tier3_amount numeric NOT NULL DEFAULT 0,
  tier4_type text,
  tier4_amount numeric,
  asking_price numeric,
  daily_lead_cap integer,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, affiliate_id)
);
GRANT SELECT ON public.listing_reward_snapshots TO authenticated;
GRANT ALL ON public.listing_reward_snapshots TO service_role;
ALTER TABLE public.listing_reward_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own snapshots" ON public.listing_reward_snapshots FOR SELECT TO authenticated USING (affiliate_id = auth.uid());
CREATE POLICY "workspace reads listing snapshots" ON public.listing_reward_snapshots FOR SELECT TO authenticated USING (public.can_access_workspace_owner(workspace_owner_id));
CREATE POLICY "superadmin reads snapshots" ON public.listing_reward_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.prevent_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'reward snapshots are immutable'; END $$;
CREATE TRIGGER trg_snapshot_immutable BEFORE UPDATE OR DELETE ON public.listing_reward_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.capture_reward_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.listings; v_id uuid;
BEGIN
  IF NEW.listing_id IS NULL OR NEW.affiliate_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF l.id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.listing_reward_snapshots(listing_id, affiliate_id, referral_id, workspace_owner_id, tier1_amount, tier2_amount, tier3_amount, tier4_type, tier4_amount, asking_price, daily_lead_cap, terms)
  VALUES (l.id, NEW.affiliate_id, NEW.id, coalesce(l.workspace_owner_id, l.user_id), coalesce(l.affiliate_tier1_amount,0), coalesce(l.affiliate_tier2_amount,0), coalesce(l.affiliate_tier3_amount,0), l.affiliate_tier4_type, l.affiliate_tier4_amount, l.asking_price, l.daily_lead_cap,
    jsonb_build_object('partner_share', 0.8, 'extra_question_fee', 10, 'questions', l.contact_options->'questions', 'questions_phone', l.contact_options->'questions_phone', 'deal_closing_commission', l.features->'deal_closing_commission', 'commission_terms_accepted_at', l.features->>'commission_terms_accepted_at', 'lead_daily_limits', l.features->'lead_daily_limits'))
  ON CONFLICT (listing_id, affiliate_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
    VALUES ('reward_snapshot_created', auth.uid(), 'listing_reward_snapshots', v_id::text,
      jsonb_build_object('listing_id', l.id, 'affiliate_id', NEW.affiliate_id, 'referral_id', NEW.id, 'tier1', l.affiliate_tier1_amount, 'tier2', l.affiliate_tier2_amount, 'tier3', l.affiliate_tier3_amount));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_capture_reward_snapshot AFTER INSERT ON public.affiliate_referrals
FOR EACH ROW EXECUTE FUNCTION public.capture_reward_snapshot();

-- Backfill snapshots for existing partner selections (current terms)
INSERT INTO public.listing_reward_snapshots(listing_id, affiliate_id, referral_id, workspace_owner_id, tier1_amount, tier2_amount, tier3_amount, tier4_type, tier4_amount, asking_price, daily_lead_cap, terms, created_at)
SELECT DISTINCT ON (r.listing_id, r.affiliate_id) l.id, r.affiliate_id, r.id, coalesce(l.workspace_owner_id,l.user_id), coalesce(l.affiliate_tier1_amount,0), coalesce(l.affiliate_tier2_amount,0), coalesce(l.affiliate_tier3_amount,0), l.affiliate_tier4_type, l.affiliate_tier4_amount, l.asking_price, l.daily_lead_cap,
  jsonb_build_object('partner_share',0.8,'extra_question_fee',10,'backfilled',true), r.created_at
FROM public.affiliate_referrals r JOIN public.listings l ON l.id = r.listing_id
WHERE r.affiliate_id IS NOT NULL
ORDER BY r.listing_id, r.affiliate_id, r.created_at
ON CONFLICT DO NOTHING;

-- 2. Trust scores
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score numeric;
ALTER TABLE public.affiliate_profiles ADD COLUMN IF NOT EXISTS trust_score numeric;

CREATE TABLE public.trust_scores (
  user_id uuid PRIMARY KEY,
  score numeric NOT NULL DEFAULT 50,
  computed_score numeric NOT NULL DEFAULT 50,
  conversion_rate numeric NOT NULL DEFAULT 0,
  inquiries_total integer NOT NULL DEFAULT 0,
  inquiries_converted integer NOT NULL DEFAULT 0,
  disputes_count integer NOT NULL DEFAULT 0,
  flagged_count integer NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  override_score numeric,
  override_reason text,
  override_by uuid,
  override_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trust_scores TO authenticated;
GRANT ALL ON public.trust_scores TO service_role;
ALTER TABLE public.trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own trust score" ON public.trust_scores FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "superadmin reads trust scores" ON public.trust_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.compute_trust_score(_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_total int := 0; v_conv int := 0; v_disputes int := 0; v_flagged int := 0; v_verified boolean := false;
  v_rate numeric := 0; v_score numeric; v_prev public.trust_scores; v_final numeric; v_phone text;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  -- Partner side: paid inquiries + submissions
  SELECT count(*) INTO v_total FROM public.listing_lead_charges WHERE affiliate_id = _user_id;
  SELECT count(*) INTO v_conv FROM public.listing_lead_charges WHERE affiliate_id = _user_id AND tier >= 2;
  SELECT v_total + count(*), v_conv + count(*) FILTER (WHERE status IN ('verified','closed','won','approved'))
    INTO v_total, v_conv FROM public.affiliate_lead_submissions WHERE affiliate_id = _user_id;
  SELECT count(*) INTO v_disputes FROM public.affiliate_lead_submissions WHERE affiliate_id = _user_id AND status IN ('rejected','disputed','fraud');
  v_disputes := v_disputes + (SELECT count(*) FROM public.affiliate_referrals WHERE affiliate_id = _user_id AND settlement_status IN ('disputed','rejected','reversed'));
  -- Advertiser side: inquiries received on own workspace listings
  SELECT v_total + count(*), v_conv + count(*) FILTER (WHERE tier >= 2) INTO v_total, v_conv
    FROM public.listing_lead_charges WHERE workspace_owner_id = _user_id;
  -- Anti-fraud flags tied to the user's phone
  SELECT regexp_replace(coalesce(phone,''),'\D','','g') INTO v_phone FROM public.profiles WHERE id = _user_id;
  IF v_phone ~ '^0' THEN v_phone := '972' || substr(v_phone, 2); END IF;
  IF coalesce(v_phone,'') <> '' THEN
    SELECT count(*) INTO v_flagged FROM public.inquiry_guard_challenges WHERE phone = v_phone AND status IN ('pending','suspended');
  END IF;
  -- Verification
  v_verified := EXISTS(SELECT 1 FROM public.affiliate_profiles WHERE user_id = _user_id AND license_status = 'verified')
             OR (coalesce(v_phone,'') <> '' AND EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND nullif(trim(coalesce(full_name,'')),'') IS NOT NULL));
  v_rate := CASE WHEN v_total > 0 THEN round(v_conv::numeric / v_total, 4) ELSE 0 END;
  v_score := 50 + CASE WHEN v_verified THEN 20 ELSE 0 END + round(least(v_rate,1) * 30)
             - least(v_disputes * 10, 40) - least(v_flagged * 15, 45);
  v_score := greatest(0, least(100, v_score));

  SELECT * INTO v_prev FROM public.trust_scores WHERE user_id = _user_id;
  v_final := coalesce(v_prev.override_score, v_score);
  INSERT INTO public.trust_scores(user_id, score, computed_score, conversion_rate, inquiries_total, inquiries_converted, disputes_count, flagged_count, is_verified, components, updated_at)
  VALUES (_user_id, v_final, v_score, v_rate, v_total, v_conv, v_disputes, v_flagged, v_verified,
    jsonb_build_object('base',50,'verified',CASE WHEN v_verified THEN 20 ELSE 0 END,'conversion',round(least(v_rate,1)*30),'disputes',-least(v_disputes*10,40),'flags',-least(v_flagged*15,45)), now())
  ON CONFLICT (user_id) DO UPDATE SET score = EXCLUDED.score, computed_score = EXCLUDED.computed_score, conversion_rate = EXCLUDED.conversion_rate,
    inquiries_total = EXCLUDED.inquiries_total, inquiries_converted = EXCLUDED.inquiries_converted, disputes_count = EXCLUDED.disputes_count,
    flagged_count = EXCLUDED.flagged_count, is_verified = EXCLUDED.is_verified, components = EXCLUDED.components, updated_at = now();

  UPDATE public.profiles SET trust_score = v_final WHERE id = _user_id AND trust_score IS DISTINCT FROM v_final;
  UPDATE public.affiliate_profiles SET trust_score = v_final WHERE user_id = _user_id AND trust_score IS DISTINCT FROM v_final;

  IF v_prev.user_id IS NULL OR v_prev.score IS DISTINCT FROM v_final OR v_prev.computed_score IS DISTINCT FROM v_score THEN
    INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
    VALUES ('trust_score_recomputed', auth.uid(), 'trust_scores', _user_id::text,
      jsonb_build_object('previous', v_prev.score, 'new', v_final, 'computed', v_score, 'override_active', v_prev.override_score IS NOT NULL,
        'conversion_rate', v_rate, 'inquiries', v_total, 'converted', v_conv, 'disputes', v_disputes, 'flags', v_flagged, 'verified', v_verified));
  END IF;
  RETURN jsonb_build_object('user_id', _user_id, 'score', v_final, 'computed', v_score, 'conversion_rate', v_rate, 'disputes', v_disputes, 'flags', v_flagged, 'verified', v_verified);
END $$;
REVOKE ALL ON FUNCTION public.compute_trust_score(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_trust_score(uuid) TO service_role;

-- Manual override (super_admin only), audited
CREATE OR REPLACE FUNCTION public.override_trust_score(_user_id uuid, _score numeric, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_prev numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _score IS NOT NULL AND (_score < 0 OR _score > 100) THEN RAISE EXCEPTION 'score must be 0-100'; END IF;
  IF nullif(trim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'reason required'; END IF;
  PERFORM public.compute_trust_score(_user_id);
  SELECT score INTO v_prev FROM public.trust_scores WHERE user_id = _user_id;
  UPDATE public.trust_scores SET override_score = _score, override_reason = _reason, override_by = auth.uid(), override_at = now(),
    score = coalesce(_score, computed_score), updated_at = now() WHERE user_id = _user_id;
  UPDATE public.profiles SET trust_score = coalesce(_score, (SELECT computed_score FROM public.trust_scores WHERE user_id=_user_id)) WHERE id = _user_id;
  UPDATE public.affiliate_profiles SET trust_score = coalesce(_score, (SELECT computed_score FROM public.trust_scores WHERE user_id=_user_id)) WHERE user_id = _user_id;
  INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
  VALUES (CASE WHEN _score IS NULL THEN 'trust_score_override_cleared' ELSE 'trust_score_override_set' END, auth.uid(), 'trust_scores', _user_id::text,
    jsonb_build_object('previous', v_prev, 'override', _score, 'reason', _reason));
  RETURN jsonb_build_object('ok', true, 'score', coalesce(_score, v_prev));
END $$;
REVOKE ALL ON FUNCTION public.override_trust_score(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.override_trust_score(uuid, numeric, text) TO authenticated, service_role;

-- Auto-recompute on relevant events
CREATE OR REPLACE FUNCTION public.trust_score_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME = 'listing_lead_charges' THEN
    PERFORM public.compute_trust_score(NEW.affiliate_id);
    PERFORM public.compute_trust_score(NEW.workspace_owner_id);
  ELSIF TG_TABLE_NAME IN ('affiliate_lead_submissions','affiliate_referrals') THEN
    PERFORM public.compute_trust_score(NEW.affiliate_id);
  ELSIF TG_TABLE_NAME = 'affiliate_profiles' THEN
    IF NEW.license_status IS DISTINCT FROM OLD.license_status THEN PERFORM public.compute_trust_score(NEW.user_id); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_trust_charges AFTER INSERT OR UPDATE OF tier ON public.listing_lead_charges FOR EACH ROW EXECUTE FUNCTION public.trust_score_event();
CREATE TRIGGER trg_trust_submissions AFTER INSERT OR UPDATE OF status ON public.affiliate_lead_submissions FOR EACH ROW EXECUTE FUNCTION public.trust_score_event();
CREATE TRIGGER trg_trust_referrals AFTER UPDATE OF settlement_status ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.trust_score_event();
CREATE TRIGGER trg_trust_license AFTER UPDATE OF license_status ON public.affiliate_profiles FOR EACH ROW EXECUTE FUNCTION public.trust_score_event();

-- 3. Audit manual status overrides on partner records
CREATE OR REPLACE FUNCTION public.audit_partner_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
  VALUES ('status_override', auth.uid(), TG_TABLE_NAME, NEW.id::text,
    jsonb_build_object('old', to_jsonb(OLD) - 'updated_at', 'new_status', CASE TG_TABLE_NAME WHEN 'affiliate_referrals' THEN NEW.settlement_status ELSE NEW.status END,
      'old_status', CASE TG_TABLE_NAME WHEN 'affiliate_referrals' THEN OLD.settlement_status ELSE OLD.status END));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_submission_status AFTER UPDATE OF status ON public.affiliate_lead_submissions
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.audit_partner_status_change();
CREATE TRIGGER trg_audit_referral_settlement AFTER UPDATE OF settlement_status ON public.affiliate_referrals
FOR EACH ROW WHEN (OLD.settlement_status IS DISTINCT FROM NEW.settlement_status) EXECUTE FUNCTION public.audit_partner_status_change();