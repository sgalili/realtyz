CREATE TABLE IF NOT EXISTS public.credit_conversion_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  credits_per_ils numeric NOT NULL DEFAULT 25 CHECK (credits_per_ils > 0 AND credits_per_ils <= 10000),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.credit_conversion_settings TO service_role;
REVOKE ALL ON public.credit_conversion_settings FROM anon, authenticated;
ALTER TABLE public.credit_conversion_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.credit_conversion_settings(id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_credits_per_ils() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce((SELECT credits_per_ils FROM public.credit_conversion_settings WHERE id), 25) $$;
GRANT EXECUTE ON FUNCTION public.get_credits_per_ils() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.credits_to_ils(_credits numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(_credits,0) / public.get_credits_per_ils() $$;
REVOKE ALL ON FUNCTION public.credits_to_ils(numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_credits_per_ils(_rate numeric) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'super_admin'),false) THEN RAISE EXCEPTION 'super_admin_required' USING ERRCODE='42501'; END IF;
 IF _rate IS NULL OR _rate <= 0 OR _rate > 10000 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
 UPDATE public.credit_conversion_settings SET credits_per_ils=_rate, updated_by=auth.uid(), updated_at=now() WHERE id;
 INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('credit_conversion_updated',auth.uid(),'credit_conversion_settings','singleton',jsonb_build_object('credits_per_ils',_rate));
 RETURN public.get_credits_per_ils();
END $$;
REVOKE ALL ON FUNCTION public.set_credits_per_ils(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_credits_per_ils(numeric) TO authenticated;

DO $do$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.grant_completed_signup_bonus'::regproc);
 IF position('bonus/25' in d) = 0 THEN RAISE EXCEPTION 'signup bonus pattern missing'; END IF;
 EXECUTE replace(d, 'bonus/25', 'public.credits_to_ils(bonus)');
 d := pg_get_functiondef('public.grant_monthly_free_credits_for'::regproc);
 IF position('greatest(0, 4 - ' in d) = 0 THEN RAISE EXCEPTION 'monthly pattern missing'; END IF;
 EXECUTE replace(d, 'greatest(0, 4 - ', 'greatest(0, public.credits_to_ils(100) - ');
 d := pg_get_functiondef('public.pay_invite_dual_bonus'::regproc);
 IF position('add_credit(r.referrer_id,v_ref,' in d) = 0 THEN RAISE EXCEPTION 'invite pattern missing'; END IF;
 d := replace(d, 'add_credit(r.referrer_id,v_ref,', 'add_credit(r.referrer_id,public.credits_to_ils(v_ref),');
 d := replace(d, 'add_credit(r.referred_user_id,v_friend,', 'add_credit(r.referred_user_id,public.credits_to_ils(v_friend),');
 EXECUTE d;
END $do$;