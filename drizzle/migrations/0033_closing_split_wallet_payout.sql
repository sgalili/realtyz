ALTER TABLE public.lead_closing_splits ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS paid_at timestamptz, ADD COLUMN IF NOT EXISTS retained_under text;
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check CHECK (type = ANY (ARRAY['launch_bonus','referral_reward','manual_adjustment','usage_deduction','topup','affiliate_lead_charge','affiliate_lead_reward','dispute_refund','dispute_clawback','closing_commission_payout']));
CREATE OR REPLACE FUNCTION public.compute_closing_split(_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s record; lic boolean; amt numeric; pct numeric; due numeric; prev numeric; delta numeric;
BEGIN
 SELECT * INTO s FROM public.affiliate_lead_submissions WHERE id=_submission_id FOR UPDATE;
 IF s IS NULL OR s.status<>'closed' THEN RETURN; END IF;
 lic := s.affiliate_id IS NOT NULL AND public.partner_can_view_closing(s.affiliate_id);
 SELECT coalesce(l.commission_amount,0) INTO amt FROM public.leads l WHERE l.id=s.lead_id AND l.workspace_owner_id=s.broker_id;
 amt:=coalesce(amt,0); pct:=CASE WHEN lic THEN 80 ELSE 0 END; due:=round(amt*pct/100,2);
 INSERT INTO public.lead_closing_splits(submission_id,lead_id,affiliate_id,workspace_owner_id,partner_is_licensed,commission_amount,partner_pct,partner_amount,platform_amount,computed_at,retained_under)
 VALUES(s.id,s.lead_id,s.affiliate_id,s.broker_id,lic,amt,pct,due,amt-due,now(),CASE WHEN lic THEN NULL ELSE 'platform_brokerage_license' END)
 ON CONFLICT(submission_id) DO UPDATE SET partner_is_licensed=EXCLUDED.partner_is_licensed,commission_amount=EXCLUDED.commission_amount,partner_pct=EXCLUDED.partner_pct,partner_amount=EXCLUDED.partner_amount,platform_amount=EXCLUDED.platform_amount,retained_under=EXCLUDED.retained_under,computed_at=now();
 SELECT paid_amount INTO prev FROM public.lead_closing_splits WHERE submission_id=s.id FOR UPDATE;
 delta := due - coalesce(prev,0);
 IF delta > 0 AND lic THEN
   PERFORM public.add_credit(s.affiliate_id, delta, 'closing_commission_payout', s.id, 'עמלת סגירה 80% למתווך מורשה');
   UPDATE public.lead_closing_splits SET paid_amount=due, paid_at=now() WHERE submission_id=s.id;
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'closing_split_computed','affiliate_lead_submissions',s.id::text,jsonb_build_object('workspace_owner_id',s.broker_id,'licensed',lic,'commission',amt,'partner_pct',pct,'paid_delta',greatest(delta,0)));
END $function$;