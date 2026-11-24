ALTER TABLE public.platform_system_settings ADD COLUMN IF NOT EXISTS monthly_free_credits numeric NOT NULL DEFAULT 20 CHECK (monthly_free_credits >= 0 AND monthly_free_credits <= 100000);

CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits_for(_owner uuid)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _wallet uuid; _grant uuid; _bal numeric; _frozen boolean; _amount numeric; _credits numeric;
 _month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
 _wallet := public.ensure_credit_wallet(_owner);
 SELECT frozen, balance_ils INTO _frozen, _bal FROM public.credit_wallets WHERE id = _wallet FOR UPDATE;
 IF _frozen THEN RETURN 0; END IF;
 INSERT INTO public.monthly_free_credit_grants(workspace_owner_id, grant_month)
 VALUES (_owner, _month) ON CONFLICT (workspace_owner_id, grant_month) DO NOTHING RETURNING id INTO _grant;
 IF _grant IS NULL THEN RETURN 0; END IF;
 SELECT coalesce((SELECT monthly_free_credits FROM public.platform_system_settings WHERE id LIMIT 1), 20) INTO _credits;
 -- Monthly reset: top the Super Admin-configured free allowance back up; purchased credits above it are kept.
 _amount := greatest(0, public.credits_to_ils(_credits) - coalesce(_bal, 0));
 IF _amount > 0 THEN
   PERFORM public.add_credit(_owner, _amount, 'manual_adjustment', _grant, _credits::text || ' קרדיטים חינם לחודש ' || to_char(_month, 'MM.YYYY'));
 END IF;
 RETURN _amount;
END; $function$;