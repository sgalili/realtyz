CREATE TABLE public.monthly_free_credit_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_owner_id uuid NOT NULL,
 grant_month date NOT NULL,
 credits numeric NOT NULL DEFAULT 500,
 amount_ils numeric NOT NULL DEFAULT 20,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workspace_owner_id, grant_month)
);
GRANT SELECT ON public.monthly_free_credit_grants TO authenticated;
GRANT ALL ON public.monthly_free_credit_grants TO service_role;
ALTER TABLE public.monthly_free_credit_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace reads own monthly grant" ON public.monthly_free_credit_grants FOR SELECT TO authenticated USING (public.ws_current_access(workspace_owner_id));

CREATE OR REPLACE FUNCTION public.claim_monthly_free_credits()
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
 _owner uuid := public.current_workspace_owner();
 _wallet uuid;
 _grant uuid;
 _month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
 _plan text;
 _frozen boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
 _wallet := public.ensure_credit_wallet(_owner);
 SELECT frozen INTO _frozen FROM public.credit_wallets WHERE id = _wallet FOR UPDATE;
 IF _frozen THEN RETURN 0; END IF;
 SELECT coalesce(p.name, s.plan_name) INTO _plan
 FROM public.user_subscriptions s LEFT JOIN public.plans p ON p.id = s.plan_id
 WHERE s.user_id = _owner ORDER BY s.created_at DESC LIMIT 1;
 IF coalesce(_plan, 'free') <> 'free' THEN RETURN 0; END IF;
 INSERT INTO public.monthly_free_credit_grants(workspace_owner_id, grant_month)
 VALUES (_owner, _month) ON CONFLICT (workspace_owner_id, grant_month) DO NOTHING RETURNING id INTO _grant;
 IF _grant IS NULL THEN RETURN 0; END IF;
 PERFORM public.add_credit(_owner, 20, 'manual_adjustment', _grant, '500 קרדיטים חינם לחודש ' || to_char(_month, 'MM.YYYY'));
 RETURN 500;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_monthly_free_credits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_monthly_free_credits() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _owner uuid := public.current_workspace_owner(); _wallet uuid; w public.credit_wallets;
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
 PERFORM public.claim_monthly_free_credits();
 _wallet := public.ensure_credit_wallet(_owner);
 SELECT * INTO w FROM public.credit_wallets WHERE id = _wallet;
 RETURN jsonb_build_object('wallet_id', w.id, 'balance_ils', w.balance_ils, 'frozen', w.frozen, 'locked_at', w.locked_at, 'lock_reason', w.lock_reason);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO authenticated;