CREATE TABLE public.invite_verified_deals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 workspace_owner_id uuid NOT NULL, source_type text NOT NULL CHECK(source_type IN ('submission','document')),
 source_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved')),
 approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,source_type,source_id)
);
GRANT SELECT ON public.invite_verified_deals TO authenticated;
GRANT ALL ON public.invite_verified_deals TO service_role;
ALTER TABLE public.invite_verified_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_verified_deals ON public.invite_verified_deals FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.invite_dual_rewards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referral_id uuid NOT NULL UNIQUE,
 deal_id uuid NOT NULL REFERENCES public.invite_verified_deals(id),
 referrer_id uuid NOT NULL, referred_user_id uuid NOT NULL UNIQUE,
 referrer_amount numeric NOT NULL DEFAULT 200 CHECK(referrer_amount=200),
 friend_amount numeric NOT NULL DEFAULT 100 CHECK(friend_amount=100),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(referrer_id<>referred_user_id)
);
GRANT SELECT ON public.invite_dual_rewards TO authenticated;
GRANT ALL ON public.invite_dual_rewards TO service_role;
ALTER TABLE public.invite_dual_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_invite_rewards ON public.invite_dual_rewards FOR SELECT TO authenticated USING(referrer_id=auth.uid() OR referred_user_id=auth.uid());
CREATE INDEX invite_verified_deals_user ON public.invite_verified_deals(user_id,approved_at);
COMMENT ON TABLE public.invite_dual_rewards IS 'Account-scoped immutable personal invitation awards; not workspace listing partner commissions.';
COMMENT ON COLUMN public.referrals.status IS 'Legacy converted_paid retained for compatibility; new deal rewards live in invite_dual_rewards, never on subscription.';
CREATE OR REPLACE FUNCTION public.pay_invite_dual_bonus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.referrals; reward uuid; u uuid; v_wallet uuid;
BEGIN
 IF NEW.status<>'approved' OR (TG_OP='UPDATE' AND OLD.status='approved') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invite-first:'||NEW.user_id::text,0));
 IF EXISTS(SELECT 1 FROM public.invite_verified_deals WHERE user_id=NEW.user_id AND status='approved' AND id<>NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO r FROM public.referrals WHERE referred_user_id=NEW.user_id FOR UPDATE;
 IF r.id IS NULL OR r.status='void' OR r.fraud_flag OR r.created_at>NEW.created_at OR r.referrer_id=r.referred_user_id THEN RETURN NEW; END IF;
 IF public.is_user_banned(r.referrer_id) OR public.is_user_banned(r.referred_user_id) THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.referred_user_id AND (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM auth.users a JOIN auth.users b ON b.id=r.referred_user_id WHERE a.id=r.referrer_id AND ((nullif(a.phone,'') IS NOT NULL AND a.phone=b.phone) OR (nullif(a.email,'') IS NOT NULL AND lower(a.email)=lower(b.email)))) THEN RETURN NEW; END IF;
 FOR u IN SELECT x FROM unnest(ARRAY[r.referrer_id,r.referred_user_id]) x ORDER BY x LOOP
  v_wallet:=public.ensure_credit_wallet(u);
  PERFORM 1 FROM public.credit_wallets WHERE id=v_wallet FOR UPDATE;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.credit_wallets WHERE user_id IN (r.referrer_id,r.referred_user_id) AND frozen) THEN RETURN NEW; END IF;
 INSERT INTO public.invite_dual_rewards(referral_id,deal_id,referrer_id,referred_user_id) VALUES(r.id,NEW.id,r.referrer_id,r.referred_user_id) ON CONFLICT DO NOTHING RETURNING id INTO reward;
 IF reward IS NULL THEN RETURN NEW; END IF;
 PERFORM public.add_credit(r.referrer_id,200,'referral_reward',reward,'בונוס כפול: הזמנת חבר, עסקה מאושרת ראשונה');
 PERFORM public.add_credit(r.referred_user_id,100,'referral_reward',reward,'בונוס כפול: בונוס קבלת פנים, עסקה מאושרת ראשונה');
 INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('invite_dual_bonus_paid',NEW.approved_by,'invite_dual_rewards',reward::text,jsonb_build_object('deal_id',NEW.id,'source_type',NEW.source_type,'source_id',NEW.source_id,'workspace_owner_id',NEW.workspace_owner_id,'referrer_id',r.referrer_id,'referred_user_id',r.referred_user_id,'referrer_amount',200,'friend_amount',100));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pay_invite_dual_bonus() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invite_deal_bonus AFTER INSERT OR UPDATE OF status ON public.invite_verified_deals FOR EACH ROW EXECUTE FUNCTION public.pay_invite_dual_bonus();
CREATE OR REPLACE FUNCTION public.approve_invite_verified_deal(_user_id uuid,_source_type text,_source_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ws uuid; v_lead uuid; v_owner uuid; v_affiliate uuid; v_created timestamptz; d uuid; participant boolean:=false; v_actor uuid:=auth.uid();
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT coalesce(public.has_role(v_actor,'super_admin'),false) THEN RAISE EXCEPTION 'verification_authority_required' USING ERRCODE='42501'; END IF;
 IF _source_type='submission' THEN
  SELECT s.broker_id,s.lead_id,l.user_id,s.affiliate_id,s.created_at INTO v_ws,v_lead,v_owner,v_affiliate,v_created FROM public.affiliate_lead_submissions s JOIN public.listings l ON l.id=s.listing_id AND l.workspace_owner_id=s.broker_id WHERE s.id=_source_id AND s.status='closed' AND s.settlement_status IN ('approved','paid') AND s.verified_at IS NOT NULL AND s.closed_at IS NOT NULL;
  participant:=_user_id IN (v_ws,v_owner,v_affiliate);
 ELSIF _source_type='document' THEN
  SELECT c.workspace_owner_id,c.lead_id,l.user_id,c.created_at INTO v_ws,v_lead,v_owner,v_created FROM public.closing_documents c JOIN public.listings l ON l.id=c.listing_id AND l.workspace_owner_id=c.workspace_owner_id WHERE c.id=_source_id AND c.status='signed' AND c.signed_at IS NOT NULL AND nullif(c.signed_pdf_path,'') IS NOT NULL;
  participant:=_user_id=v_owner;
 ELSE RAISE EXCEPTION 'invalid_evidence_type'; END IF;
 IF v_ws IS NULL THEN RAISE EXCEPTION 'approved_deal_evidence_required'; END IF;
 participant:=coalesce(participant,false) OR EXISTS(SELECT 1 FROM public.leads ld JOIN auth.users au ON au.id=_user_id AND au.phone_confirmed_at IS NOT NULL AND nullif(au.phone,'') IS NOT NULL AND regexp_replace(au.phone,'[^0-9]','','g')=regexp_replace(ld.phone_number,'[^0-9]','','g') WHERE ld.id=v_lead AND ld.workspace_owner_id=v_ws AND NOT ld.is_demo);
 IF NOT participant OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_user_id) THEN RAISE EXCEPTION 'verified_participant_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invite-first:'||_user_id::text,0));
 INSERT INTO public.invite_verified_deals(user_id,workspace_owner_id,source_type,source_id,created_at) VALUES(_user_id,v_ws,_source_type,_source_id,v_created) ON CONFLICT(user_id,source_type,source_id) DO NOTHING;
 SELECT id INTO d FROM public.invite_verified_deals WHERE user_id=_user_id AND source_type=_source_type AND source_id=_source_id;
 UPDATE public.invite_verified_deals SET status='approved',approved_by=v_actor,approved_at=now() WHERE id=d AND status='pending';
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.approve_invite_verified_deal(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_invite_verified_deal(uuid,text,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.invite_submission_approved() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid; actor uuid:=auth.uid(); owner uuid; contact uuid;
BEGIN
 IF NEW.status<>'closed' OR NEW.settlement_status NOT IN ('approved','paid') OR NEW.verified_at IS NULL OR NEW.closed_at IS NULL THEN RETURN NEW; END IF;
 IF OLD.status='closed' AND OLD.settlement_status IN ('approved','paid') THEN RETURN NEW; END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT coalesce(public.has_role(actor,'super_admin'),false) THEN
  IF NOT public.ws_current_access(NEW.broker_id) OR NOT public.can_close_deal(actor) OR NOT public.partner_can_view_closing(actor) THEN RETURN NEW; END IF;
 END IF;
 SELECT user_id INTO owner FROM public.listings WHERE id=NEW.listing_id AND workspace_owner_id=NEW.broker_id;
 SELECT au.id INTO contact FROM auth.users au JOIN public.leads ld ON ld.workspace_owner_id=NEW.broker_id AND ld.id=NEW.lead_id AND NOT ld.is_demo AND regexp_replace(au.phone,'[^0-9]','','g')=regexp_replace(ld.phone_number,'[^0-9]','','g') WHERE nullif(au.phone,'') IS NOT NULL AND au.phone_confirmed_at IS NOT NULL LIMIT 1;
 FOR u IN SELECT DISTINCT x FROM unnest(ARRAY[NEW.affiliate_id,NEW.broker_id,owner,contact]) x WHERE x IS NOT NULL LOOP
  IF actor IS NOT NULL AND NOT coalesce(public.has_role(actor,'super_admin'),false) AND (actor=u OR EXISTS(SELECT 1 FROM public.referrals WHERE referred_user_id=u AND referrer_id=actor)) THEN CONTINUE; END IF;
  -- The helper remains superadmin/service-only; independently authorized broker approval uses the same persisted evidence via this internal trigger.
  IF auth.role()='service_role' OR coalesce(public.has_role(actor,'super_admin'),false) THEN
   PERFORM public.approve_invite_verified_deal(u,'submission',NEW.id);
  ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('invite-first:'||u::text,0));
   INSERT INTO public.invite_verified_deals(user_id,workspace_owner_id,source_type,source_id,status,approved_by,approved_at,created_at) VALUES(u,NEW.broker_id,'submission',NEW.id,'approved',actor,now(),NEW.created_at) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invite_submission_approved() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invite_submission_approved AFTER UPDATE OF status,settlement_status ON public.affiliate_lead_submissions FOR EACH ROW EXECUTE FUNCTION public.invite_submission_approved();
CREATE OR REPLACE FUNCTION public.get_my_referral_stats() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); code text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 code:=public.get_my_referral_code();
 RETURN jsonb_build_object('code',code,'total',(SELECT count(*) FROM public.referrals WHERE referrer_id=uid),'registered_free',(SELECT count(*) FROM public.referrals r WHERE referrer_id=uid AND NOT EXISTS(SELECT 1 FROM public.invite_dual_rewards b WHERE b.referral_id=r.id)),'converted_paid',0,'verified_deals',(SELECT count(*) FROM public.invite_dual_rewards WHERE referrer_id=uid),'earned_ils',(SELECT coalesce(sum(referrer_amount),0) FROM public.invite_dual_rewards WHERE referrer_id=uid),'welcome_earned_ils',(SELECT coalesce(sum(friend_amount),0) FROM public.invite_dual_rewards WHERE referred_user_id=uid),'referrals','[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_my_referral_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;
CREATE OR REPLACE FUNCTION public.register_referral(_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inviter uuid; uid uuid:=auth.uid(); rid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 IF _code IS NULL OR upper(btrim(_code)) !~ '^[A-Z0-9]{4,16}$' THEN RETURN jsonb_build_object('ok',false,'reason','invalid_code'); END IF;
 IF EXISTS(SELECT 1 FROM public.referrals WHERE referred_user_id=uid) THEN RETURN jsonb_build_object('ok',false,'reason','already_attributed'); END IF;
 IF EXISTS(SELECT 1 FROM public.invite_verified_deals WHERE user_id=uid AND status='approved') THEN RETURN jsonb_build_object('ok',false,'reason','already_completed_deal'); END IF;
 SELECT id INTO inviter FROM public.profiles WHERE referral_code=upper(btrim(_code));
 IF inviter IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unknown_code'); END IF;
 IF inviter=uid THEN RETURN jsonb_build_object('ok',false,'reason','self_referral'); END IF;
 IF public.is_user_banned(inviter) OR public.is_user_banned(uid) THEN RETURN jsonb_build_object('ok',false,'reason','account_suspended'); END IF;
 INSERT INTO public.referrals(referrer_id,referred_user_id,referral_code,status) VALUES(inviter,uid,upper(btrim(_code)),'registered_free') ON CONFLICT(referred_user_id) DO NOTHING RETURNING id INTO rid;
 IF rid IS NOT NULL THEN INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('invite_registered',uid,'referrals',rid::text,jsonb_build_object('referrer_id',inviter,'reward_pending_verified_deal',true)); END IF;
 RETURN jsonb_build_object('ok',rid IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.register_referral(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_referral(text) TO authenticated;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.subscribe_to_plan(text)'::regprocedure) INTO definition;
 definition:=replace(definition, E'  IF _plan.monthly_price_ils > 0 THEN\n    SELECT * INTO _ref FROM public.referrals WHERE referred_user_id = _owner AND NOT reward_granted AND status <> ''void'';\n    IF _ref.id IS NOT NULL THEN\n      UPDATE public.referrals SET status = ''converted_paid'', reward_granted = true, converted_at = now() WHERE id = _ref.id;\n      PERFORM public.add_credit(_ref.referrer_id, 50, ''referral_reward'', _ref.id, ''תגמול הפניה'');\n    END IF;\n  END IF;', '  -- Personal invite rewards are paid only by evidence-verified deal approval.');
 IF definition LIKE '%add_credit(_ref.referrer_id%' THEN RAISE EXCEPTION 'legacy_referral_reward_not_removed'; END IF;
 EXECUTE definition;
END $migration$;