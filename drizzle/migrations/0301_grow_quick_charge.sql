ALTER TABLE public.grow_payment_orders DROP CONSTRAINT grow_payment_orders_purpose_check;
ALTER TABLE public.grow_payment_orders DROP CONSTRAINT grow_order_amount_by_purpose;
ALTER TABLE public.grow_payment_orders
  ADD CONSTRAINT grow_payment_orders_purpose_check CHECK (purpose IN ('subscription','wallet_topup','developer_subscription','quick_charge')),
  ADD CONSTRAINT grow_order_amount_by_purpose CHECK (
    (purpose='subscription' AND amount_ils=6500 AND plan_code IS NULL)
    OR (purpose='wallet_topup' AND amount_ils>0 AND amount_ils<=10000 AND amount_ils=round(amount_ils,2) AND workspace_owner_id IS NOT NULL AND plan_code IS NULL)
    OR (purpose='developer_subscription' AND plan_code='developer_monthly' AND base_amount_ils=9500 AND vat_amount_ils=1710 AND amount_ils=11210 AND duration_days=30 AND workspace_owner_id IS NOT NULL AND terms_accepted_at IS NOT NULL)
    OR (purpose='quick_charge' AND amount_ils>=1 AND amount_ils<=100000 AND amount_ils=round(amount_ils,2) AND plan_code IS NULL)
  );
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
  ELSIF o.purpose<>'quick_charge' THEN
   INSERT INTO public.grow_subscription_entitlements(order_id,user_id,title,benefits,starts_at,expires_at,plan_code,workspace_owner_id)
   VALUES(o.id,o.user_id,o.title,o.benefits,now(),now()+make_interval(days=>o.duration_days),o.plan_code,o.workspace_owner_id);
   IF o.purpose='developer_subscription' THEN
    PERFORM public.ensure_profile_row(o.user_id);
    INSERT INTO public.user_roles(user_id,role) VALUES (o.user_id,'developer') ON CONFLICT(user_id,role) DO NOTHING;
    UPDATE public.workspace_memberships SET account_type='developer' WHERE user_id=o.user_id AND workspace_owner_id=o.user_id;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'test',o.environment='sandbox');
END $$;
REVOKE ALL ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) TO service_role;