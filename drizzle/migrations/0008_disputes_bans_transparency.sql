ALTER TABLE public.credit_transactions DROP CONSTRAINT credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check CHECK (type = ANY (ARRAY['launch_bonus','referral_reward','manual_adjustment','usage_deduction','topup','affiliate_lead_charge','affiliate_lead_reward','dispute_refund','dispute_clawback']));
ALTER TABLE public.listing_lead_charges ADD COLUMN IF NOT EXISTS dispute_status text;
ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false;

-- Israeli business days (Sun–Thu)
CREATE OR REPLACE FUNCTION public.add_business_days(_from timestamptz, _days int) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d timestamptz := _from; n int := 0;
BEGIN
  WHILE n < _days LOOP
    d := d + interval '1 day';
    IF extract(dow FROM d AT TIME ZONE 'Asia/Jerusalem') NOT IN (5,6) THEN n := n + 1; END IF;
  END LOOP;
  RETURN d;
END $$;

CREATE TABLE public.lead_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL UNIQUE,
  listing_id uuid NOT NULL,
  lead_id uuid,
  workspace_owner_id uuid NOT NULL,
  affiliate_id uuid,
  opened_by uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'received',
  initial_check_due timestamptz NOT NULL,
  decision_due timestamptz NOT NULL,
  reviewed_by uuid, reviewed_at timestamptz,
  decision text, decision_note text, decided_by uuid, decided_at timestamptz,
  appeal_deadline timestamptz,
  appealed_by uuid, appeal_reason text, appealed_at timestamptz,
  appeal_decision text, appeal_note text, appeal_decided_by uuid, appeal_decided_at timestamptz,
  refunded_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_disputes TO authenticated;
GRANT ALL ON public.lead_disputes TO service_role;
ALTER TABLE public.lead_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read disputes" ON public.lead_disputes FOR SELECT TO authenticated
  USING (public.can_access_workspace_owner(workspace_owner_id) OR affiliate_id = auth.uid());
CREATE POLICY "reviewers read disputes" ON public.lead_disputes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'moderator'));

CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  banned_by uuid,
  active boolean NOT NULL DEFAULT true,
  effects jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz, lifted_by uuid
);
GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ban visible" ON public.user_bans FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "superadmin bans" ON public.user_bans FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE UNIQUE INDEX user_bans_one_active ON public.user_bans(user_id) WHERE active;

CREATE OR REPLACE FUNCTION public.is_user_banned(_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_bans WHERE user_id = _u AND active)
$$;

CREATE OR REPLACE FUNCTION public.dispute_audit(_action text, _id uuid, _details jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details) VALUES (_action, auth.uid(), 'lead_disputes', _id::text, _details)
$$;

-- 1. Open (advertiser, within 7 days of charge)
CREATE OR REPLACE FUNCTION public.open_lead_dispute(_charge_id uuid, _reason text, _details text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.listing_lead_charges; v_id uuid;
BEGIN
  SELECT * INTO c FROM public.listing_lead_charges WHERE id = _charge_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'charge not found'; END IF;
  IF NOT public.can_access_workspace_owner(c.workspace_owner_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF c.created_at < now() - interval '7 days' THEN RAISE EXCEPTION 'dispute window closed'; END IF;
  IF nullif(trim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'reason required'; END IF;
  INSERT INTO public.lead_disputes(charge_id, listing_id, lead_id, workspace_owner_id, affiliate_id, opened_by, reason, details, initial_check_due, decision_due)
  VALUES (c.id, c.listing_id, c.lead_id, c.workspace_owner_id, c.affiliate_id, auth.uid(), left(_reason,200), left(_details,2000), public.add_business_days(now(),2), public.add_business_days(now(),5))
  RETURNING id INTO v_id;
  UPDATE public.listing_lead_charges SET dispute_status = 'open' WHERE id = c.id;
  PERFORM public.dispute_audit('dispute_opened', v_id, jsonb_build_object('charge_id', c.id, 'reason', _reason, 'gross', c.gross));
  INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel)
  SELECT u, 'lead_dispute', 'התקבלה מחלוקת על פנייה', 'הבדיקה הראשונית תסתיים תוך 2 ימי עסקים, והחלטה תינתן תוך 5 ימי עסקים.', '/my-ads', 'in_app'
  FROM unnest(ARRAY[auth.uid(), c.affiliate_id]) u WHERE u IS NOT NULL;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- 2. Initial check (staff)
CREATE OR REPLACE FUNCTION public.review_lead_dispute(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.lead_disputes SET status='initial_review', reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() WHERE id=_id AND status='received';
  PERFORM public.dispute_audit('dispute_initial_review', _id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.apply_dispute_refund(_d public.lead_disputes) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.listing_lead_charges; v_net numeric;
BEGIN
  SELECT * INTO c FROM public.listing_lead_charges WHERE id = _d.charge_id FOR UPDATE;
  IF c.is_leftover OR coalesce(c.gross,0) <= 0 OR _d.refunded_amount > 0 THEN RETURN 0; END IF;
  PERFORM public.add_credit(c.workspace_owner_id, c.gross, 'dispute_refund', _d.id, 'החזר מחלוקת פנייה');
  v_net := round(c.gross * 0.8);
  IF c.affiliate_id IS NOT NULL AND v_net > 0 THEN PERFORM public.add_credit(c.affiliate_id, -v_net, 'dispute_clawback', _d.id, 'קיזוז מחלוקת פנייה'); END IF;
  UPDATE public.lead_disputes SET refunded_amount = c.gross WHERE id = _d.id;
  RETURN c.gross;
END $$;
REVOKE ALL ON FUNCTION public.apply_dispute_refund(public.lead_disputes) FROM PUBLIC, anon, authenticated;

-- 3. Decision (staff). _upheld = advertiser is right -> refund
CREATE OR REPLACE FUNCTION public.decide_lead_dispute(_id uuid, _upheld boolean, _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.lead_disputes; v_ref numeric := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF nullif(trim(coalesce(_note,'')),'') IS NULL THEN RAISE EXCEPTION 'note required'; END IF;
  SELECT * INTO d FROM public.lead_disputes WHERE id=_id FOR UPDATE;
  IF d.status NOT IN ('received','initial_review') THEN RAISE EXCEPTION 'already decided'; END IF;
  IF _upheld THEN v_ref := public.apply_dispute_refund(d); END IF;
  UPDATE public.lead_disputes SET status = CASE WHEN _upheld THEN 'upheld' ELSE 'rejected' END, decision = CASE WHEN _upheld THEN 'upheld' ELSE 'rejected' END,
    decision_note=_note, decided_by=auth.uid(), decided_at=now(), appeal_deadline=now()+interval '7 days',
    reviewed_by=coalesce(reviewed_by,auth.uid()), reviewed_at=coalesce(reviewed_at,now()), updated_at=now() WHERE id=_id;
  UPDATE public.listing_lead_charges SET dispute_status = CASE WHEN _upheld THEN 'upheld' ELSE 'rejected' END WHERE id=d.charge_id;
  PERFORM public.dispute_audit('dispute_decided', _id, jsonb_build_object('upheld', _upheld, 'note', _note, 'refunded', v_ref));
  INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel)
  SELECT u, 'lead_dispute', 'התקבלה החלטה במחלוקת', CASE WHEN _upheld THEN 'המחלוקת התקבלה והסכום הוחזר.' ELSE 'המחלוקת נדחתה.' END || ' ניתן לערער תוך 7 ימים.', '/my-ads', 'in_app'
  FROM unnest(ARRAY[d.opened_by, d.affiliate_id]) u WHERE u IS NOT NULL;
  IF d.affiliate_id IS NOT NULL THEN PERFORM public.compute_trust_score(d.affiliate_id); END IF;
  RETURN jsonb_build_object('ok', true, 'refunded', v_ref);
END $$;

-- 4. Appeal (either party, 7 days)
CREATE OR REPLACE FUNCTION public.appeal_lead_dispute(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.lead_disputes;
BEGIN
  SELECT * INTO d FROM public.lead_disputes WHERE id=_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (public.can_access_workspace_owner(d.workspace_owner_id) OR d.affiliate_id = auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF d.status NOT IN ('upheld','rejected') OR d.appeal_deadline < now() THEN RAISE EXCEPTION 'appeal not available'; END IF;
  IF nullif(trim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.lead_disputes SET status='appealed', appealed_by=auth.uid(), appeal_reason=left(_reason,2000), appealed_at=now(), updated_at=now() WHERE id=_id;
  PERFORM public.dispute_audit('dispute_appealed', _id, jsonb_build_object('reason', _reason));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 5. Appeal decision by a neutral reviewer (moderator/super_admin, never the original decider)
CREATE OR REPLACE FUNCTION public.decide_lead_appeal(_id uuid, _upheld boolean, _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.lead_disputes; v_ref numeric := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO d FROM public.lead_disputes WHERE id=_id FOR UPDATE;
  IF d.status <> 'appealed' THEN RAISE EXCEPTION 'no open appeal'; END IF;
  IF auth.uid() IN (d.decided_by, d.opened_by, d.affiliate_id) THEN RAISE EXCEPTION 'reviewer must be neutral'; END IF;
  IF nullif(trim(coalesce(_note,'')),'') IS NULL THEN RAISE EXCEPTION 'note required'; END IF;
  -- Final outcome: upheld means advertiser refund stands/applies; not upheld reverses any refund.
  IF _upheld THEN v_ref := public.apply_dispute_refund(d);
  ELSIF d.refunded_amount > 0 THEN
    PERFORM public.add_credit(d.workspace_owner_id, -d.refunded_amount, 'dispute_clawback', d.id, 'ביטול החזר לאחר ערעור');
    IF d.affiliate_id IS NOT NULL THEN PERFORM public.add_credit(d.affiliate_id, round(d.refunded_amount*0.8), 'dispute_refund', d.id, 'השבת תגמול לאחר ערעור'); END IF;
    UPDATE public.lead_disputes SET refunded_amount = 0 WHERE id=_id;
  END IF;
  UPDATE public.lead_disputes SET status = CASE WHEN _upheld THEN 'appeal_upheld' ELSE 'appeal_rejected' END,
    appeal_decision = CASE WHEN _upheld THEN 'upheld' ELSE 'rejected' END, appeal_note=_note, appeal_decided_by=auth.uid(), appeal_decided_at=now(), updated_at=now() WHERE id=_id;
  UPDATE public.listing_lead_charges SET dispute_status = CASE WHEN _upheld THEN 'upheld' ELSE 'rejected' END WHERE id=d.charge_id;
  PERFORM public.dispute_audit('dispute_appeal_decided', _id, jsonb_build_object('upheld', _upheld, 'note', _note));
  IF d.affiliate_id IS NOT NULL THEN PERFORM public.compute_trust_score(d.affiliate_id); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Evidence for reviewers (audit trail + screening)
CREATE OR REPLACE FUNCTION public.get_dispute_evidence(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.lead_disputes;
BEGIN
  IF NOT (public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO d FROM public.lead_disputes WHERE id=_id;
  RETURN jsonb_build_object(
    'dispute', to_jsonb(d),
    'charge', (SELECT to_jsonb(c) FROM public.listing_lead_charges c WHERE c.id=d.charge_id),
    'screening', (SELECT coalesce(jsonb_agg(jsonb_build_object('channel',s.channel,'verified_name',s.verified_name,'questions',s.questions,'answers',s.answers,'evidence',s.evidence_source,'at',s.updated_at)),'[]') FROM public.listing_inquiry_states s WHERE s.listing_id=d.listing_id AND s.lead_id=d.lead_id),
    'audit', (SELECT coalesce(jsonb_agg(jsonb_build_object('action',a.action,'at',a.created_at,'details',a.details) ORDER BY a.created_at),'[]') FROM public.audit_logs a WHERE a.target_id IN (d.id::text, d.charge_id::text, d.listing_id::text)),
    'flags', (SELECT count(*) FROM public.inquiry_guard_challenges g JOIN public.leads l ON l.phone_number=g.phone WHERE l.id=d.lead_id)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.open_lead_dispute(uuid,text,text), public.review_lead_dispute(uuid), public.decide_lead_dispute(uuid,boolean,text), public.appeal_lead_dispute(uuid,text), public.decide_lead_appeal(uuid,boolean,text), public.get_dispute_evidence(uuid) TO authenticated;

-- Trust score counts upheld disputes against partners
DO $$ DECLARE src text; BEGIN
  src := pg_get_functiondef('public.compute_trust_score(uuid)'::regprocedure);
  src := replace(src, 'WHERE affiliate_id = _user_id AND settlement_status IN (''disputed'',''rejected'',''reversed''));',
    'WHERE affiliate_id = _user_id AND settlement_status IN (''disputed'',''rejected'',''reversed'')) + (SELECT count(*) FROM public.lead_disputes WHERE affiliate_id = _user_id AND status IN (''upheld'',''appeal_upheld''));');
  EXECUTE src;
END $$;

-- Ban protocol
CREATE OR REPLACE FUNCTION public.ban_user(_user uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_listings uuid[]; v_jobs int; v_ap int; v_bal numeric; v_ban uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF public.has_role(_user,'super_admin') THEN RAISE EXCEPTION 'cannot ban super admin'; END IF;
  IF nullif(trim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'reason required'; END IF;
  IF public.is_user_banned(_user) THEN RAISE EXCEPTION 'already banned'; END IF;
  -- Active listings: hide & stop partner distribution (data kept)
  WITH u AS (UPDATE public.listings SET is_published=false, affiliate_enabled=false, distribution_paused=true, distribution_paused_at=now()
    WHERE (workspace_owner_id=_user OR user_id=_user OR owner_id=_user) AND (is_published OR affiliate_enabled) RETURNING id)
  SELECT coalesce(array_agg(id),'{}') INTO v_listings FROM u;
  -- Ongoing Rita / posting distributions
  UPDATE public.campaign_activity_queue SET status='cancelled' WHERE workspace_owner_id=_user AND status IN ('pending','processing','ready');
  GET DIAGNOSTICS v_jobs = ROW_COUNT;
  UPDATE public.autopilot_queue SET status='cancelled' WHERE user_id=_user AND status IN ('pending','processing');
  GET DIAGNOSTICS v_ap = ROW_COUNT;
  -- Pending wallet balance frozen (not deleted)
  PERFORM public.ensure_credit_wallet(_user);
  UPDATE public.credit_wallets SET frozen=true WHERE user_id=_user RETURNING balance_ils INTO v_bal;
  INSERT INTO public.user_bans(user_id, reason, banned_by, effects)
  VALUES (_user, _reason, auth.uid(), jsonb_build_object('listings', to_jsonb(v_listings), 'cancelled_jobs', v_jobs, 'cancelled_autopilot', v_ap, 'frozen_balance', v_bal))
  RETURNING id INTO v_ban;
  INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
  VALUES ('user_banned', auth.uid(), 'user_bans', _user::text, jsonb_build_object('ban_id', v_ban, 'reason', _reason, 'listings', cardinality(v_listings), 'jobs', v_jobs, 'autopilot', v_ap, 'frozen_balance', v_bal));
  PERFORM public.compute_trust_score(_user);
  RETURN jsonb_build_object('ok', true, 'listings_paused', cardinality(v_listings), 'jobs_cancelled', v_jobs + v_ap, 'frozen_balance', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.unban_user(_user uuid, _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.user_bans;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO b FROM public.user_bans WHERE user_id=_user AND active FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'no active ban'; END IF;
  UPDATE public.listings SET is_published=true, affiliate_enabled=true, distribution_paused=false, distribution_paused_at=NULL
    WHERE id IN (SELECT (jsonb_array_elements_text(b.effects->'listings'))::uuid);
  UPDATE public.credit_wallets SET frozen=false WHERE user_id=_user;
  UPDATE public.user_bans SET active=false, lifted_at=now(), lifted_by=auth.uid() WHERE id=b.id;
  INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
  VALUES ('user_unbanned', auth.uid(), 'user_bans', _user::text, jsonb_build_object('ban_id', b.id, 'note', _note));
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.ban_user(uuid,text), public.unban_user(uuid,text) TO authenticated;

-- Banned users cannot pick listings
CREATE OR REPLACE FUNCTION public.block_banned_referral() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_user_banned(NEW.affiliate_id) THEN RAISE EXCEPTION 'account suspended'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_banned_referral BEFORE INSERT ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.block_banned_referral();

-- Charging: banned partner's verified leads stay with the advertiser, without partner reward
DO $$ DECLARE src text; BEGIN
  src := pg_get_functiondef('public.charge_lead_commission(uuid,integer,uuid,uuid)'::regprocedure);
  src := replace(src, ' IF public.inquiry_is_suspicious(ld.phone_number) THEN',
    ' IF _affiliate_id IS NOT NULL AND public.is_user_banned(_affiliate_id) THEN RETURN jsonb_build_object(''ok'',true,''charged'',0,''partner_suspended'',true); END IF;
 IF public.inquiry_is_suspicious(ld.phone_number) THEN');
  EXECUTE src;
END $$;

-- Transparency summary for the current user (advertiser workspace + partner)
CREATE OR REPLACE FUNCTION public.get_transparency_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ws uuid := public.current_workspace_owner(); v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN jsonb_build_object(
    'advertiser', jsonb_build_object(
      'active_listings', (SELECT count(*) FROM public.listings WHERE workspace_owner_id=v_ws AND is_published AND coalesce(status,'live')<>'discarded'),
      'paused_listings', (SELECT count(*) FROM public.listings WHERE workspace_owner_id=v_ws AND distribution_paused),
      'leads_30d', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND created_at > now()-interval '30 days'),
      'approved', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND coalesce(dispute_status,'') NOT IN ('open','upheld')),
      'disputed', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND dispute_status='open'),
      'rejected', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND dispute_status='upheld'),
      'spent', (SELECT coalesce(sum(gross),0) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND NOT is_leftover AND coalesce(dispute_status,'')<>'upheld')),
    'partner', jsonb_build_object(
      'promoted_listings', (SELECT count(DISTINCT listing_id) FROM public.affiliate_referrals WHERE affiliate_id=v_me),
      'leads_30d', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND created_at > now()-interval '30 days'),
      'approved', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND coalesce(dispute_status,'') NOT IN ('open','upheld')),
      'disputed', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND dispute_status='open'),
      'rejected', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND dispute_status='upheld')),
    'wallet', (SELECT jsonb_build_object('balance', coalesce(balance_ils,0), 'frozen', frozen) FROM public.credit_wallets WHERE user_id=v_me),
    'pending_disputes_value', (SELECT coalesce(sum(c.gross),0) FROM public.lead_disputes d JOIN public.listing_lead_charges c ON c.id=d.charge_id WHERE (d.affiliate_id=v_me OR d.workspace_owner_id=v_ws) AND d.status IN ('received','initial_review','appealed')),
    'banned', public.is_user_banned(v_me),
    'trust_score', (SELECT score FROM public.trust_scores WHERE user_id=v_me)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_transparency_summary() TO authenticated;