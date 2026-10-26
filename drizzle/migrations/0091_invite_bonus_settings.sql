CREATE TABLE public.invite_bonus_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id), referrer_credits numeric NOT NULL DEFAULT 200 CHECK(referrer_credits>=0 AND referrer_credits<=1000000), friend_credits numeric NOT NULL DEFAULT 100 CHECK(friend_credits>=0 AND friend_credits<=1000000), updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.invite_bonus_settings TO authenticated;
GRANT ALL ON public.invite_bonus_settings TO service_role;
ALTER TABLE public.invite_bonus_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY invite_bonus_admin_read ON public.invite_bonus_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
INSERT INTO public.invite_bonus_settings(id) VALUES(true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_invite_bonus_settings() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT jsonb_build_object('referrer_credits',referrer_credits,'friend_credits',friend_credits) FROM public.invite_bonus_settings WHERE id),jsonb_build_object('referrer_credits',200,'friend_credits',100)) $$;
GRANT EXECUTE ON FUNCTION public.get_invite_bonus_settings() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_invite_bonus_settings(_referrer numeric,_friend numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'super_admin'),false) THEN RAISE EXCEPTION 'super_admin_required' USING ERRCODE='42501'; END IF;
 IF _referrer IS NULL OR _friend IS NULL OR _referrer<0 OR _friend<0 OR _referrer>1000000 OR _friend>1000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
 INSERT INTO public.invite_bonus_settings(id,referrer_credits,friend_credits,updated_by,updated_at) VALUES(true,_referrer,_friend,auth.uid(),now())
 ON CONFLICT(id) DO UPDATE SET referrer_credits=EXCLUDED.referrer_credits,friend_credits=EXCLUDED.friend_credits,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('invite_bonus_settings_updated',auth.uid(),'invite_bonus_settings','singleton',jsonb_build_object('referrer_credits',_referrer,'friend_credits',_friend));
 RETURN public.get_invite_bonus_settings();
END $$;
REVOKE ALL ON FUNCTION public.set_invite_bonus_settings(numeric,numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_invite_bonus_settings(numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_invite_dual_bonus()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.referrals; reward uuid; u uuid; v_wallet uuid; v_ref numeric:=200; v_friend numeric:=100;
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
 SELECT referrer_credits,friend_credits INTO v_ref,v_friend FROM public.invite_bonus_settings WHERE id;
 v_ref:=coalesce(v_ref,200); v_friend:=coalesce(v_friend,100);
 INSERT INTO public.invite_dual_rewards(referral_id,deal_id,referrer_id,referred_user_id,referrer_amount,friend_amount) VALUES(r.id,NEW.id,r.referrer_id,r.referred_user_id,v_ref,v_friend) ON CONFLICT DO NOTHING RETURNING id INTO reward;
 IF reward IS NULL THEN RETURN NEW; END IF;
 IF v_ref>0 THEN PERFORM public.add_credit(r.referrer_id,v_ref,'referral_reward',reward,'בונוס כפול: הזמנת חבר, עסקה מאושרת ראשונה'); END IF;
 IF v_friend>0 THEN PERFORM public.add_credit(r.referred_user_id,v_friend,'referral_reward',reward,'בונוס כפול: בונוס קבלת פנים, עסקה מאושרת ראשונה'); END IF;
 INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('invite_dual_bonus_paid',NEW.approved_by,'invite_dual_rewards',reward::text,jsonb_build_object('deal_id',NEW.id,'source_type',NEW.source_type,'source_id',NEW.source_id,'workspace_owner_id',NEW.workspace_owner_id,'referrer_id',r.referrer_id,'referred_user_id',r.referred_user_id,'referrer_amount',v_ref,'friend_amount',v_friend));
 RETURN NEW;
END $function$;