CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits_for(_owner uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 _wallet uuid; _grant uuid; _bal numeric; _frozen boolean; _amount numeric;
 _month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
 _wallet := public.ensure_credit_wallet(_owner);
 SELECT frozen, balance_ils INTO _frozen, _bal FROM public.credit_wallets WHERE id = _wallet FOR UPDATE;
 IF _frozen THEN RETURN 0; END IF;
 INSERT INTO public.monthly_free_credit_grants(workspace_owner_id, grant_month)
 VALUES (_owner, _month) ON CONFLICT (workspace_owner_id, grant_month) DO NOTHING RETURNING id INTO _grant;
 IF _grant IS NULL THEN RETURN 0; END IF;
 -- Monthly reset: top the free allowance back up to 200 credits; purchased credits above it are kept.
 _amount := greatest(0, 200 - coalesce(_bal, 0));
 IF _amount > 0 THEN
   PERFORM public.add_credit(_owner, _amount, 'manual_adjustment', _grant, '200 קרדיטים חינם לחודש ' || to_char(_month, 'MM.YYYY'));
 END IF;
 RETURN _amount;
END; $$;
REVOKE ALL ON FUNCTION public.grant_monthly_free_credits_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_monthly_free_credits()
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _owner uuid := public.current_workspace_owner();
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
 RETURN public.grant_monthly_free_credits_for(_owner);
END; $$;

CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n integer := 0;
BEGIN
 FOR r IN SELECT user_id FROM public.credit_wallets WHERE NOT coalesce(frozen,false) LOOP
   IF public.grant_monthly_free_credits_for(r.user_id) > 0 THEN n := n + 1; END IF;
 END LOOP;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.grant_monthly_free_credits_all() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_free_credits_on_new_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 BEGIN PERFORM public.grant_monthly_free_credits_for(NEW.user_id);
 EXCEPTION WHEN OTHERS THEN RAISE WARNING 'free credit grant failed: %', SQLERRM; END;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_free_credits_on_new_wallet ON public.credit_wallets;
CREATE TRIGGER trg_free_credits_on_new_wallet AFTER INSERT ON public.credit_wallets
FOR EACH ROW EXECUTE FUNCTION public.grant_free_credits_on_new_wallet();

SELECT cron.unschedule('monthly-free-credits') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='monthly-free-credits');
SELECT cron.schedule('monthly-free-credits', '5 0 1 * *', $$SELECT public.grant_monthly_free_credits_all();$$);