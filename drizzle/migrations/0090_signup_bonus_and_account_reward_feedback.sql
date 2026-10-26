CREATE TABLE public.signup_bonus_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), bonus_credits numeric NOT NULL DEFAULT 500 CHECK (bonus_credits >= 0 AND bonus_credits <= 1000000), updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.signup_bonus_settings TO authenticated;
GRANT ALL ON public.signup_bonus_settings TO service_role;
ALTER TABLE public.signup_bonus_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY signup_bonus_admin_read ON public.signup_bonus_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY signup_bonus_admin_insert ON public.signup_bonus_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY signup_bonus_admin_update ON public.signup_bonus_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TABLE public.signup_bonus_grants (user_id uuid PRIMARY KEY, credits numeric NOT NULL CHECK (credits >= 0), transaction_id uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.signup_bonus_grants TO authenticated;
GRANT ALL ON public.signup_bonus_grants TO service_role;
ALTER TABLE public.signup_bonus_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY signup_bonus_own_read ON public.signup_bonus_grants FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.grant_completed_signup_bonus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bonus numeric; granted uuid;
BEGIN
 IF NEW.primary_user_type IS NULL THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' THEN IF OLD.primary_user_type IS NOT NULL THEN RETURN NEW; END IF; END IF;
 SELECT bonus_credits INTO bonus FROM public.signup_bonus_settings WHERE id = true;
 bonus := coalesce(bonus,500);
 INSERT INTO public.signup_bonus_grants(user_id,credits) VALUES(NEW.id,bonus) ON CONFLICT(user_id) DO NOTHING RETURNING user_id INTO granted;
 IF granted IS NOT NULL AND bonus > 0 THEN
  PERFORM public.add_credit(NEW.id, bonus/25, 'launch_bonus', NEW.id, 'בונוס הרשמה חינם');
  UPDATE public.signup_bonus_grants SET transaction_id=(SELECT id FROM public.credit_transactions WHERE user_id=NEW.id AND type='launch_bonus' AND reference_id=NEW.id ORDER BY created_at DESC LIMIT 1) WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.grant_completed_signup_bonus() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER completed_signup_bonus AFTER INSERT OR UPDATE OF primary_user_type ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.grant_completed_signup_bonus();
CREATE OR REPLACE FUNCTION public.get_signup_bonus_settings() RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'access_denied'; END IF; RETURN coalesce((SELECT bonus_credits FROM public.signup_bonus_settings WHERE id=true),500); END $$;
CREATE OR REPLACE FUNCTION public.set_signup_bonus_settings(_credits numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'access_denied'; END IF; IF _credits IS NULL OR _credits<0 OR _credits>1000000 OR _credits='NaN'::numeric THEN RAISE EXCEPTION 'invalid_bonus'; END IF; INSERT INTO public.signup_bonus_settings(id,bonus_credits,updated_by) VALUES(true,_credits,auth.uid()) ON CONFLICT(id) DO UPDATE SET bonus_credits=excluded.bonus_credits,updated_by=auth.uid(),updated_at=now(); END $$;
CREATE OR REPLACE FUNCTION public.get_my_signup_bonus() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF; RETURN (SELECT jsonb_build_object('credits',credits,'created_at',created_at) FROM public.signup_bonus_grants WHERE user_id=auth.uid()); END $$;
CREATE OR REPLACE FUNCTION public.get_my_new_earnings(_since timestamptz) RETURNS TABLE(id uuid,type text,amount_ils numeric,created_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF; IF _since IS NULL THEN RAISE EXCEPTION 'invalid_since'; END IF; RETURN QUERY SELECT t.id,t.type,t.amount_ils,t.created_at FROM public.credit_transactions t WHERE t.user_id=auth.uid() AND t.amount_ils>0 AND t.type IN ('affiliate_lead_reward','closing_commission_payout','referral_reward') AND t.created_at>greatest(_since,now()-interval '1 day') ORDER BY t.created_at,t.id LIMIT 1000; END $$;
REVOKE ALL ON FUNCTION public.get_signup_bonus_settings(), public.set_signup_bonus_settings(numeric), public.get_my_signup_bonus(), public.get_my_new_earnings(timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_signup_bonus_settings(), public.set_signup_bonus_settings(numeric), public.get_my_signup_bonus(), public.get_my_new_earnings(timestamptz) TO authenticated;
CREATE INDEX IF NOT EXISTS credit_transactions_earning_feedback_idx ON public.credit_transactions(user_id,created_at) WHERE amount_ils>0 AND type IN ('affiliate_lead_reward','closing_commission_payout','referral_reward');