ALTER TABLE public.grow_payment_orders ADD COLUMN wallet_bonus_percent numeric NOT NULL DEFAULT 0 CHECK (wallet_bonus_percent IN (0,5,10,15,20,25)), ADD COLUMN wallet_bonus_ils numeric NOT NULL DEFAULT 0 CHECK (wallet_bonus_ils>=0), ADD COLUMN wallet_credit_rate numeric;
CREATE FUNCTION public.snapshot_wallet_package_bonus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.purpose='wallet_topup' THEN
  IF NEW.amount_ils<5 OR NEW.amount_ils>2500 OR NEW.amount_ils<>round(NEW.amount_ils,2) THEN RAISE EXCEPTION 'invalid_wallet_package'; END IF;
  NEW.wallet_bonus_percent := CASE WHEN NEW.amount_ils>=2500 THEN 25 WHEN NEW.amount_ils>=1000 THEN 20 WHEN NEW.amount_ils>=500 THEN 15 WHEN NEW.amount_ils>=200 THEN 10 WHEN NEW.amount_ils>=50 THEN 5 ELSE 0 END;
  NEW.wallet_bonus_ils := round(NEW.amount_ils*NEW.wallet_bonus_percent/100,2);
  NEW.wallet_credit_rate := public.get_credits_per_ils();
 ELSE
  NEW.wallet_bonus_percent:=0; NEW.wallet_bonus_ils:=0; NEW.wallet_credit_rate:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_wallet_package_bonus() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_wallet_package_bonus() TO service_role;
CREATE TRIGGER snapshot_wallet_package_bonus BEFORE INSERT ON public.grow_payment_orders FOR EACH ROW EXECUTE FUNCTION public.snapshot_wallet_package_bonus();
CREATE FUNCTION public.protect_wallet_package_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF ROW(NEW.wallet_bonus_percent,NEW.wallet_bonus_ils,NEW.wallet_credit_rate,NEW.amount_ils,NEW.purpose,NEW.workspace_owner_id) IS DISTINCT FROM ROW(OLD.wallet_bonus_percent,OLD.wallet_bonus_ils,OLD.wallet_credit_rate,OLD.amount_ils,OLD.purpose,OLD.workspace_owner_id) THEN RAISE EXCEPTION 'wallet_package_snapshot_immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_wallet_package_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_wallet_package_snapshot BEFORE UPDATE ON public.grow_payment_orders FOR EACH ROW EXECUTE FUNCTION public.protect_wallet_package_snapshot();
CREATE OR REPLACE FUNCTION public.complete_grow_payment(_order_id uuid,_transaction_id text,_amount_ils numeric,_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.grow_payment_orders;
BEGIN
 SELECT * INTO o FROM public.grow_payment_orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF o.amount_ils<>_amount_ils OR o.environment<>_environment OR nullif(_transaction_id,'') IS NULL THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
 IF o.status='paid' THEN
  IF o.transaction_id<>_transaction_id THEN RAISE EXCEPTION 'transaction_mismatch'; END IF;
  RETURN jsonb_build_object('ok',true,'duplicate',true);
 END IF;
 IF o.status NOT IN ('pending','link_ready') THEN RAISE EXCEPTION 'order_not_payable'; END IF;
 UPDATE public.grow_payment_orders SET status='paid',transaction_id=_transaction_id,paid_at=now() WHERE id=o.id;
 IF o.environment='live' THEN
  IF o.purpose='wallet_topup' THEN
   PERFORM public.add_credit(o.workspace_owner_id,o.amount_ils+o.wallet_bonus_ils,'topup',o.id,'Grow wallet deposit; bonus '||o.wallet_bonus_percent||'%');
  ELSE
   INSERT INTO public.grow_subscription_entitlements(order_id,user_id,title,benefits,starts_at,expires_at) VALUES(o.id,o.user_id,o.title,o.benefits,now(),now()+make_interval(days=>o.duration_days));
  END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'test',o.environment='sandbox');
END $$;
REVOKE ALL ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) TO service_role;