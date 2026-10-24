CREATE OR REPLACE FUNCTION public.validate_public_property_rewards() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE closing_value numeric;
BEGIN
 IF TG_OP='INSERT' OR (NOT (coalesce(OLD.is_published,false) OR coalesce(OLD.affiliate_enabled,false)) AND (coalesce(NEW.is_published,false) OR coalesce(NEW.affiliate_enabled,false))) THEN
  IF coalesce(NEW.is_published,false) OR coalesce(NEW.affiliate_enabled,false) THEN
   closing_value:=coalesce(nullif(NEW.features->'deal_closing_commission'->>'value','')::numeric,NEW.affiliate_tier4_amount,0);
   IF coalesce(NEW.asking_price,0)<=0 THEN RAISE EXCEPTION 'יש להגדיר מחיר נכס חיובי לפני פרסום'; END IF;
   IF closing_value<=0 THEN RAISE EXCEPTION 'יש להגדיר עמלת סגירה לפני פרסום'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_public_property_rewards BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.validate_public_property_rewards();

CREATE OR REPLACE FUNCTION public.capture_reward_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.listings; v_id uuid;
BEGIN
 IF NEW.listing_id IS NULL OR NEW.affiliate_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO l FROM public.listings WHERE id=NEW.listing_id FOR SHARE;
 IF l.id IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.listing_reward_snapshots(listing_id,affiliate_id,referral_id,workspace_owner_id,tier1_amount,tier2_amount,tier3_amount,tier4_type,tier4_amount,asking_price,daily_lead_cap,terms)
 VALUES(l.id,NEW.affiliate_id,NEW.id,coalesce(l.workspace_owner_id,l.user_id),coalesce(l.affiliate_tier1_amount,0),coalesce(l.affiliate_tier2_amount,0),coalesce(l.affiliate_tier3_amount,0),coalesce(l.features->'deal_closing_commission'->>'type',l.affiliate_tier4_type),coalesce(nullif(l.features->'deal_closing_commission'->>'value','')::numeric,l.affiliate_tier4_amount),l.asking_price,l.daily_lead_cap,
 jsonb_build_object('partner_share',0.8,'extra_question_fee',10,'questions',l.contact_options->'questions','questions_phone',l.contact_options->'questions_phone','form_fields',l.contact_options->'form_fields','deal_closing_commission',l.features->'deal_closing_commission','commission_terms_accepted_at',l.features->>'commission_terms_accepted_at','lead_daily_limits',l.contact_options->'lead_daily_limits'))
 ON CONFLICT(listing_id,affiliate_id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN
 INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('reward_snapshot_created',auth.uid(),'listing_reward_snapshots',v_id::text,jsonb_build_object('listing_id',l.id,'affiliate_id',NEW.affiliate_id,'referral_id',NEW.id));
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.lock_submission_reward_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap public.listing_reward_snapshots;
BEGIN
 IF NEW.listing_id IS NULL OR NEW.affiliate_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO snap FROM public.listing_reward_snapshots WHERE listing_id=NEW.listing_id AND affiliate_id=NEW.affiliate_id AND workspace_owner_id=NEW.broker_id;
 IF snap.id IS NULL THEN RAISE EXCEPTION 'locked reward terms unavailable'; END IF;
 NEW.tier1_amount:=snap.tier1_amount; NEW.tier2_amount:=snap.tier2_amount; NEW.tier3_amount:=snap.tier3_amount;
 IF public.partner_can_view_closing(NEW.affiliate_id) THEN
  NEW.tier4_type:=coalesce(snap.terms->'deal_closing_commission'->>'type',snap.tier4_type);
  NEW.tier4_amount:=coalesce(nullif(snap.terms->'deal_closing_commission'->>'value','')::numeric,snap.tier4_amount,0);
 ELSE NEW.tier4_amount:=0; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_lock_submission_reward_terms BEFORE INSERT OR UPDATE ON public.affiliate_lead_submissions FOR EACH ROW EXECUTE FUNCTION public.lock_submission_reward_terms();

CREATE OR REPLACE FUNCTION public.compute_closing_split(_submission_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.affiliate_lead_submissions; snap public.listing_reward_snapshots; lic boolean; amt numeric; pct numeric; due numeric; prev numeric; delta numeric; locked_value numeric; locked_type text;
BEGIN
 SELECT * INTO s FROM public.affiliate_lead_submissions WHERE id=_submission_id FOR UPDATE;
 IF s.id IS NULL OR s.status<>'closed' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=s.lead_id AND workspace_owner_id=s.broker_id) THEN RAISE EXCEPTION 'closing lead workspace mismatch'; END IF;
 SELECT * INTO snap FROM public.listing_reward_snapshots WHERE listing_id=s.listing_id AND affiliate_id=s.affiliate_id AND workspace_owner_id=s.broker_id;
 IF snap.id IS NULL THEN RAISE EXCEPTION 'locked closing terms unavailable'; END IF;
 locked_value:=coalesce(nullif(snap.terms->'deal_closing_commission'->>'value','')::numeric,snap.tier4_amount,0);
 locked_type:=coalesce(snap.terms->'deal_closing_commission'->>'type',snap.tier4_type,'fixed');
 amt:=CASE WHEN locked_type='percent' THEN round(coalesce(snap.asking_price,0)*locked_value/100,2) ELSE locked_value END;
 lic:=s.affiliate_id IS NOT NULL AND public.partner_can_view_closing(s.affiliate_id);
 pct:=CASE WHEN lic THEN 80 ELSE 0 END; due:=round(amt*pct/100,2);
 INSERT INTO public.lead_closing_splits(submission_id,lead_id,affiliate_id,workspace_owner_id,partner_is_licensed,commission_amount,partner_pct,partner_amount,platform_amount,computed_at,retained_under)
 VALUES(s.id,s.lead_id,s.affiliate_id,s.broker_id,lic,amt,pct,due,amt-due,now(),CASE WHEN lic THEN NULL ELSE 'platform_brokerage_license' END)
 ON CONFLICT(submission_id) DO UPDATE SET partner_is_licensed=EXCLUDED.partner_is_licensed,commission_amount=EXCLUDED.commission_amount,partner_pct=EXCLUDED.partner_pct,partner_amount=EXCLUDED.partner_amount,platform_amount=EXCLUDED.platform_amount,retained_under=EXCLUDED.retained_under,computed_at=now();
 SELECT paid_amount INTO prev FROM public.lead_closing_splits WHERE submission_id=s.id FOR UPDATE;
 delta:=due-coalesce(prev,0);
 IF delta>0 AND lic THEN
 PERFORM public.add_credit(s.affiliate_id,delta,'closing_commission_payout',s.id,'עמלת סגירה 80% למתווך מורשה');
 UPDATE public.lead_closing_splits SET paid_amount=due,paid_at=now() WHERE submission_id=s.id;
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'closing_split_computed','affiliate_lead_submissions',s.id::text,jsonb_build_object('workspace_owner_id',s.broker_id,'snapshot_id',snap.id,'licensed',lic,'commission',amt,'partner_pct',pct,'paid_delta',greatest(delta,0)));
END $$;
REVOKE ALL ON FUNCTION public.lock_submission_reward_terms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_submission_reward_terms() TO service_role;