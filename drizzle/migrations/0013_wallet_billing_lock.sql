ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS lock_reason text;

CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  added_by uuid,
  provider text NOT NULL,
  provider_token text,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean NOT NULL DEFAULT true,
  auto_recharge_enabled boolean NOT NULL DEFAULT true,
  recharge_amount numeric NOT NULL DEFAULT 200,
  status text NOT NULL DEFAULT 'active',
  last_charge_error text,
  last_charge_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, workspace_owner_id, provider, brand, last4, exp_month, exp_year, is_default, auto_recharge_enabled, recharge_amount, status, last_charge_error, last_charge_at, created_at) ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read payment_methods" ON public.payment_methods FOR SELECT TO authenticated USING (public.ws_current_access(workspace_owner_id));
CREATE TRIGGER payment_methods_touch BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Wallet lock: an empty wallet tries the saved card; with no working card the account is restricted.
CREATE OR REPLACE FUNCTION public.wallet_apply_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _card public.payment_methods;
BEGIN
  IF NEW.balance_ils > 0 THEN
    NEW.locked_at := NULL; NEW.lock_reason := NULL; RETURN NEW;
  END IF;
  IF NEW.balance_ils < OLD.balance_ils AND NEW.locked_at IS NULL THEN
    SELECT * INTO _card FROM public.payment_methods
      WHERE workspace_owner_id = NEW.user_id AND status = 'active' AND auto_recharge_enabled AND provider_token IS NOT NULL
      ORDER BY is_default DESC, created_at DESC LIMIT 1;
    NEW.locked_at := now();
    NEW.lock_reason := CASE WHEN _card.id IS NULL THEN 'no_card' ELSE 'card_charge_pending' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credit_wallets_lock BEFORE UPDATE OF balance_ils ON public.credit_wallets FOR EACH ROW EXECUTE FUNCTION public.wallet_apply_lock();

CREATE OR REPLACE FUNCTION public.get_my_wallet()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _owner uuid := public.current_workspace_owner(); _wallet uuid; w public.credit_wallets;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  _wallet := public.ensure_credit_wallet(_owner);
  SELECT * INTO w FROM public.credit_wallets WHERE id = _wallet;
  RETURN jsonb_build_object('wallet_id', _wallet, 'balance_ils', w.balance_ils, 'frozen', w.frozen, 'locked_at', w.locked_at, 'lock_reason', w.lock_reason);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_wallet_ledger(_limit integer DEFAULT 200)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _owner uuid := public.current_workspace_owner();
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC) FROM (
      SELECT t.id, t.amount_ils, t.type, t.note, t.created_at, t.reference_id,
        ch.tier, ch.gross, ch.extra_fee, ch.dispute_status,
        l.id AS listing_id, coalesce(nullif(l.property_title,''), l.address) AS listing_title, l.city AS listing_city,
        ld.full_name AS lead_name
      FROM public.credit_transactions t
      LEFT JOIN LATERAL (SELECT * FROM public.listing_lead_charges c WHERE c.lead_id = t.reference_id AND c.workspace_owner_id = _owner ORDER BY c.created_at DESC LIMIT 1) ch ON t.type LIKE 'affiliate_lead%'
      LEFT JOIN public.listings l ON l.id = ch.listing_id
      LEFT JOIN public.leads ld ON ld.id = t.reference_id AND ld.workspace_owner_id = _owner
      WHERE t.user_id = _owner
      ORDER BY t.created_at DESC LIMIT greatest(least(_limit, 1000), 1)
    ) x), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_my_wallet_ledger(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet_ledger(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_card_auto_recharge(_id uuid, _enabled boolean, _amount numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _amount IS NULL OR _amount < 50 OR _amount > 10000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE public.payment_methods SET auto_recharge_enabled = _enabled, recharge_amount = _amount
   WHERE id = _id AND public.ws_current_access(workspace_owner_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_card_auto_recharge(uuid, boolean, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_card_auto_recharge(uuid, boolean, numeric) TO authenticated;