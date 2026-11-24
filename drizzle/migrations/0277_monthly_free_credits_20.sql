CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits_for(_owner uuid)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _wallet uuid; _grant uuid; _bal numeric; _frozen boolean; _amount numeric;
 _month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
 _wallet := public.ensure_credit_wallet(_owner);
 SELECT frozen, balance_ils INTO _frozen, _bal FROM public.credit_wallets WHERE id = _wallet FOR UPDATE;
 IF _frozen THEN RETURN 0; END IF;
 INSERT INTO public.monthly_free_credit_grants(workspace_owner_id, grant_month)
 VALUES (_owner, _month) ON CONFLICT (workspace_owner_id, grant_month) DO NOTHING RETURNING id INTO _grant;
 IF _grant IS NULL THEN RETURN 0; END IF;
 -- Monthly reset: top the free allowance back up to 20 credits; purchased credits above it are kept.
 _amount := greatest(0, public.credits_to_ils(20) - coalesce(_bal, 0));
 IF _amount > 0 THEN
   PERFORM public.add_credit(_owner, _amount, 'manual_adjustment', _grant, '20 קרדיטים חינם לחודש ' || to_char(_month, 'MM.YYYY'));
 END IF;
 RETURN _amount;
END; $function$;