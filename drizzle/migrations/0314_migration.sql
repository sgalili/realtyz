ALTER TABLE public.grow_payment_orders DROP CONSTRAINT IF EXISTS grow_payment_orders_purpose_check;
ALTER TABLE public.grow_payment_orders ADD CONSTRAINT grow_payment_orders_purpose_check CHECK (purpose = ANY (ARRAY['subscription','wallet_topup','developer_subscription','quick_charge','personal_whatsapp']));
DO $$ DECLARE c text; BEGIN
 SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.grow_payment_orders'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%quick_charge%amount_ils >= (1)%';
 IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.grow_payment_orders DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.grow_payment_orders ADD CONSTRAINT grow_payment_orders_purpose_amount_check CHECK (
 (purpose='subscription' AND amount_ils=6500 AND plan_code IS NULL)
 OR (purpose='wallet_topup' AND amount_ils>0 AND amount_ils<=10000 AND amount_ils=round(amount_ils,2) AND workspace_owner_id IS NOT NULL AND plan_code IS NULL)
 OR (purpose='developer_subscription' AND plan_code='developer_monthly' AND base_amount_ils=9500 AND vat_amount_ils=1710 AND amount_ils=11210 AND duration_days=30 AND workspace_owner_id IS NOT NULL AND terms_accepted_at IS NOT NULL)
 OR (purpose='quick_charge' AND amount_ils>=1 AND amount_ils<=100000 AND amount_ils=round(amount_ils,2) AND plan_code IS NULL)
 OR (purpose='personal_whatsapp' AND plan_code='personal_whatsapp_monthly' AND amount_ils=59 AND duration_days=30 AND workspace_owner_id IS NOT NULL AND card_mandate)
);

CREATE TABLE public.personal_whatsapp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_owner_id uuid NOT NULL,
  phone text NOT NULL,
  order_id uuid UNIQUE REFERENCES public.grow_payment_orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','admin_notified','linked','cancelled')),
  admin_notified_at timestamptz,
  admin_notify_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.personal_whatsapp_requests TO authenticated;
GRANT ALL ON public.personal_whatsapp_requests TO service_role;
ALTER TABLE public.personal_whatsapp_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or super admin read personal wa requests" ON public.personal_whatsapp_requests FOR SELECT TO authenticated
 USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX personal_whatsapp_requests_user_idx ON public.personal_whatsapp_requests(user_id, workspace_owner_id, created_at DESC);