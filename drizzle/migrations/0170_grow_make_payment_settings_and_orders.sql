CREATE TABLE public.grow_payment_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
 business_id text NOT NULL DEFAULT '', verification_phone text NOT NULL DEFAULT '',
 sending_mode text NOT NULL DEFAULT 'none' CHECK (sending_mode IN ('sms','none')),
 subscription_title text NOT NULL DEFAULT '', duration_days integer CHECK (duration_days BETWEEN 1 AND 3650),
 benefits text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT false,
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.grow_payment_settings TO authenticated;
GRANT ALL ON public.grow_payment_settings TO service_role;
ALTER TABLE public.grow_payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY grow_admin_settings ON public.grow_payment_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TABLE public.grow_payment_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 environment text NOT NULL CHECK (environment IN ('sandbox','live')),
 amount_ils numeric NOT NULL DEFAULT 6500 CHECK (amount_ils = 6500),
 duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 3650), title text NOT NULL, benefits text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','link_ready','paid','failed')),
 transaction_id text, payment_url text, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz,
 UNIQUE(environment,transaction_id)
);
GRANT SELECT ON public.grow_payment_orders TO authenticated;
GRANT ALL ON public.grow_payment_orders TO service_role;
ALTER TABLE public.grow_payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY grow_own_orders ON public.grow_payment_orders FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE TABLE public.grow_subscription_entitlements (
 order_id uuid PRIMARY KEY REFERENCES public.grow_payment_orders(id), user_id uuid NOT NULL,
 title text NOT NULL, benefits text NOT NULL, starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
);
GRANT SELECT ON public.grow_subscription_entitlements TO authenticated;
GRANT ALL ON public.grow_subscription_entitlements TO service_role;
ALTER TABLE public.grow_subscription_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY grow_own_entitlements ON public.grow_subscription_entitlements FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE FUNCTION public.complete_grow_payment(_order_id uuid,_transaction_id text,_amount_ils numeric,_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.grow_payment_orders;
BEGIN
 SELECT * INTO o FROM public.grow_payment_orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF o.amount_ils <> _amount_ils OR o.environment <> _environment OR nullif(_transaction_id,'') IS NULL THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
 IF o.status='paid' THEN
  IF o.transaction_id <> _transaction_id THEN RAISE EXCEPTION 'transaction_mismatch'; END IF;
  RETURN jsonb_build_object('ok',true,'duplicate',true);
 END IF;
 IF o.status NOT IN ('pending','link_ready') THEN RAISE EXCEPTION 'order_not_payable'; END IF;
 UPDATE public.grow_payment_orders SET status='paid',transaction_id=_transaction_id,paid_at=now() WHERE id=o.id;
 IF o.environment='live' THEN
  INSERT INTO public.grow_subscription_entitlements(order_id,user_id,title,benefits,starts_at,expires_at)
  VALUES(o.id,o.user_id,o.title,o.benefits,now(),now()+make_interval(days=>o.duration_days));
 END IF;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'test',o.environment='sandbox');
END $$;
REVOKE ALL ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) TO service_role;
COMMENT ON TABLE public.grow_subscription_entitlements IS 'Separate payment-backed Grow subscription records; sandbox payments grant no live entitlement or wallet credits.';