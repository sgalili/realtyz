CREATE OR REPLACE FUNCTION public.compute_closing_split(_submission_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; lic boolean; amt numeric; pct numeric;
BEGIN
 SELECT * INTO s FROM public.affiliate_lead_submissions WHERE id=_submission_id;
 IF s IS NULL OR s.status<>'closed' THEN RETURN; END IF;
 SELECT EXISTS(SELECT 1 FROM public.affiliate_profiles WHERE user_id=s.affiliate_id AND license_status='verified') INTO lic;
 SELECT coalesce(l.commission_amount,0) INTO amt FROM public.leads l WHERE l.id=s.lead_id AND l.workspace_owner_id=s.broker_id;
 amt:=coalesce(amt,0); pct:=CASE WHEN lic THEN 80 ELSE 0 END;
 INSERT INTO public.lead_closing_splits(submission_id,lead_id,affiliate_id,workspace_owner_id,partner_is_licensed,commission_amount,partner_pct,partner_amount,platform_amount,computed_at) VALUES(s.id,s.lead_id,s.affiliate_id,s.broker_id,lic,amt,pct,round(amt*pct/100,2),round(amt*(100-pct)/100,2),now()) ON CONFLICT(submission_id) DO UPDATE SET partner_is_licensed=EXCLUDED.partner_is_licensed,commission_amount=EXCLUDED.commission_amount,partner_pct=EXCLUDED.partner_pct,partner_amount=EXCLUDED.partner_amount,platform_amount=EXCLUDED.platform_amount,computed_at=now();
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'closing_split_computed','affiliate_lead_submissions',s.id::text,jsonb_build_object('submission_id',s.id,'workspace_owner_id',s.broker_id,'licensed',lic,'commission',amt,'partner_pct',pct));
END $$;