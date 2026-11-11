-- 100 free credits (4 ILS at 25 credits/ILS) for signup and the monthly reset.
ALTER TABLE public.signup_bonus_settings ALTER COLUMN bonus_credits SET DEFAULT 100;
INSERT INTO public.signup_bonus_settings(id,bonus_credits) VALUES(true,100)
ON CONFLICT(id) DO UPDATE SET bonus_credits=100, updated_at=now();

CREATE OR REPLACE FUNCTION public.get_signup_bonus_settings() RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'access_denied'; END IF; RETURN coalesce((SELECT bonus_credits FROM public.signup_bonus_settings WHERE id=true),100); END $$;

CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits_for(_owner uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _wallet uuid; _grant uuid; _bal numeric; _frozen boolean; _amount numeric;
 _month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
 _wallet := public.ensure_credit_wallet(_owner);
 SELECT frozen, balance_ils INTO _frozen, _bal FROM public.credit_wallets WHERE id = _wallet FOR UPDATE;
 IF _frozen THEN RETURN 0; END IF;
 INSERT INTO public.monthly_free_credit_grants(workspace_owner_id, grant_month)
 VALUES (_owner, _month) ON CONFLICT (workspace_owner_id, grant_month) DO NOTHING RETURNING id INTO _grant;
 IF _grant IS NULL THEN RETURN 0; END IF;
 -- Monthly reset: top the free allowance back up to 100 credits (4 ILS); purchased credits above it are kept.
 _amount := greatest(0, 4 - coalesce(_bal, 0));
 IF _amount > 0 THEN
   PERFORM public.add_credit(_owner, _amount, 'manual_adjustment', _grant, '100 קרדיטים חינם לחודש ' || to_char(_month, 'MM.YYYY'));
 END IF;
 RETURN _amount;
END; $function$;

-- Signup bonus tops the wallet up to the configured amount instead of stacking on the monthly allowance.
CREATE OR REPLACE FUNCTION public.grant_completed_signup_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE bonus numeric; granted uuid; _wallet uuid; _bal numeric; _add numeric;
BEGIN
 IF NEW.primary_user_type IS NULL THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' THEN IF OLD.primary_user_type IS NOT NULL THEN RETURN NEW; END IF; END IF;
 SELECT bonus_credits INTO bonus FROM public.signup_bonus_settings WHERE id = true;
 bonus := coalesce(bonus,100);
 INSERT INTO public.signup_bonus_grants(user_id,credits) VALUES(NEW.id,bonus) ON CONFLICT(user_id) DO NOTHING RETURNING user_id INTO granted;
 IF granted IS NOT NULL AND bonus > 0 THEN
  _wallet := public.ensure_credit_wallet(NEW.id);
  SELECT balance_ils INTO _bal FROM public.credit_wallets WHERE id=_wallet FOR UPDATE;
  _add := greatest(0, bonus/25 - coalesce(_bal,0));
  IF _add > 0 THEN
   PERFORM public.add_credit(NEW.id, _add, 'launch_bonus', NEW.id, 'בונוס הרשמה חינם');
   UPDATE public.signup_bonus_grants SET transaction_id=(SELECT id FROM public.credit_transactions WHERE user_id=NEW.id AND type='launch_bonus' AND reference_id=NEW.id ORDER BY created_at DESC LIMIT 1) WHERE user_id=NEW.id;
  END IF;
 END IF;
 RETURN NEW;
END $function$;

-- Retroactive correction: wallets funded only by free grants are reset to 100 credits minus actual usage.
WITH w AS (
 SELECT cw.id, cw.user_id, cw.balance_ils,
  coalesce(sum(t.amount_ils) FILTER (WHERE t.amount_ils < 0),0) AS used,
  count(*) FILTER (WHERE t.amount_ils > 0 AND NOT (t.type='launch_bonus' OR t.reference_id IN (SELECT id FROM public.monthly_free_credit_grants))) AS paid
 FROM public.credit_wallets cw LEFT JOIN public.credit_transactions t ON t.wallet_id=cw.id
 GROUP BY cw.id
), fix AS (
 SELECT id, user_id, balance_ils, greatest(0, 4 + used) AS target FROM w WHERE paid=0 AND balance_ils > greatest(0, 4 + used)
), tx AS (
 INSERT INTO public.credit_transactions(wallet_id,user_id,amount_ils,type,note)
 SELECT id, user_id, target - balance_ils, 'manual_adjustment', 'תיקון יתרת קרדיטים חינם ל־100' FROM fix RETURNING wallet_id
)
UPDATE public.credit_wallets c SET balance_ils=f.target, updated_at=now() FROM fix f WHERE c.id=f.id;