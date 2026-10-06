CREATE TABLE public.listing_inquiry_states (
 listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 workspace_owner_id uuid NOT NULL,
 channel text NOT NULL,
 verified_name text,
 questions jsonb NOT NULL DEFAULT '[]',
 answers jsonb NOT NULL DEFAULT '[]',
 evidence_source text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(listing_id, lead_id, channel)
);
GRANT ALL ON public.listing_inquiry_states TO service_role;
ALTER TABLE public.listing_inquiry_states ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER listing_inquiry_states_updated BEFORE UPDATE ON public.listing_inquiry_states FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE OR REPLACE FUNCTION public.charge_lead_commission(_listing_id uuid, _tier integer, _affiliate_id uuid DEFAULT NULL, _reference_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 l public.listings; ld public.leads; s public.listing_inquiry_states; c public.listing_lead_charges;
 v_owner uuid; v_base numeric; v_gross numeric; v_extra integer := 0; v_delta numeric; v_net numeric; v_balance numeric; v_questions jsonb;
BEGIN
 IF _reference_id IS NULL OR _tier NOT IN (1,2,3) THEN RETURN jsonb_build_object('ok',false,'error','invalid_inquiry'); END IF;
 SELECT * INTO l FROM public.listings WHERE id=_listing_id;
 IF l.id IS NULL OR NOT (coalesce(l.is_published,false) OR coalesce(l.affiliate_enabled,false)) THEN RETURN jsonb_build_object('ok',false,'error','listing_not_available'); END IF;
 v_owner:=coalesce(l.workspace_owner_id,l.user_id);
 SELECT * INTO ld FROM public.leads WHERE id=_reference_id AND workspace_owner_id=v_owner;
 IF ld.id IS NULL OR coalesce(ld.phone_number,'') !~ '^972[0-9]{8,9}$' THEN RETURN jsonb_build_object('ok',false,'error','identity_missing'); END IF;
 IF _affiliate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.affiliate_referrals WHERE listing_id=l.id AND affiliate_id=_affiliate_id) THEN RETURN jsonb_build_object('ok',false,'error','invalid_referral'); END IF;
 SELECT * INTO s FROM public.listing_inquiry_states WHERE listing_id=l.id AND lead_id=ld.id AND workspace_owner_id=v_owner AND nullif(trim(verified_name),'') IS NOT NULL AND (_tier=1 OR channel=CASE _tier WHEN 2 THEN 'whatsapp' ELSE 'phone' END) ORDER BY updated_at DESC LIMIT 1;
 IF s.lead_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','identity_unverified'); END IF;
 v_base:=CASE _tier WHEN 1 THEN coalesce(l.affiliate_tier1_amount,0) WHEN 2 THEN coalesce(l.affiliate_tier2_amount,0) ELSE coalesce(l.affiliate_tier3_amount,0) END;
 IF v_base<=0 THEN RETURN jsonb_build_object('ok',true,'charged',0,'inactive',true); END IF;
 IF _tier IN(2,3) THEN
  v_questions:=CASE _tier WHEN 2 THEN coalesce(l.contact_options->'questions','[]') ELSE coalesce(l.contact_options->'questions_phone',l.contact_options->'questions','[]') END;
  IF jsonb_typeof(v_questions)<>'array' OR jsonb_array_length(v_questions)<3 OR s.questions IS DISTINCT FROM v_questions OR jsonb_array_length(s.answers)<>jsonb_array_length(v_questions) OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.answers) a WHERE a->>'satisfactory' IS DISTINCT FROM 'true' OR nullif(trim(a->>'answer'),'') IS NULL) THEN RETURN jsonb_build_object('ok',true,'charged',0,'pending_screening',true); END IF;
  v_extra:=greatest(jsonb_array_length(v_questions)-3,0);
 END IF;
 v_gross:=v_base+v_extra*10;
 PERFORM pg_advisory_xact_lock(hashtextextended(l.id::text||':'||ld.id::text,31));
 SELECT * INTO c FROM public.listing_lead_charges WHERE listing_id=l.id AND lead_id=ld.id AND created_at>now()-interval '24 hours' ORDER BY tier DESC,created_at DESC LIMIT 1 FOR UPDATE;
 IF c.id IS NOT NULL AND c.tier>=_tier THEN RETURN jsonb_build_object('ok',true,'charged',0,'duplicate',true,'tier',c.tier); END IF;
 IF c.id IS NULL THEN
  INSERT INTO public.listing_lead_charges(listing_id,workspace_owner_id,affiliate_id,tier,gross,is_leftover,lead_id) VALUES(l.id,v_owner,_affiliate_id,_tier,v_gross,public.listing_daily_cap_reached(l.id),ld.id) RETURNING * INTO c;
  v_delta:=v_gross;
 ELSE
  v_delta:=greatest(v_gross-c.gross,0);
  UPDATE public.listing_lead_charges SET tier=_tier,gross=greatest(gross,v_gross) WHERE id=c.id;
 END IF;
 IF c.is_leftover THEN RETURN jsonb_build_object('ok',true,'charged',0,'leftover',true,'tier',_tier); END IF;
 v_net:=greatest(round((CASE WHEN c.tier<_tier THEN greatest(c.gross,v_gross) ELSE v_gross END)*0.8)-CASE WHEN c.tier<_tier THEN round(c.gross*0.8) ELSE 0 END,0);
 IF v_delta>0 THEN
  v_balance:=public.add_credit(v_owner,-v_delta,'affiliate_lead_charge',ld.id,'עמלת פנייה · סוג '||_tier::text);
  IF c.affiliate_id IS NOT NULL AND v_net>0 THEN PERFORM public.add_credit(c.affiliate_id,v_net,'affiliate_lead_reward',ld.id,'תגמול פנייה · סוג '||_tier::text); END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'charged',v_delta,'tier',_tier,'extra_questions',v_extra,'balance',v_balance);
END; $$;
REVOKE ALL ON FUNCTION public.charge_lead_commission(uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.charge_lead_commission(uuid,integer,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.attribute_whatsapp_referral(_ref text,_phone text,_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.affiliate_referrals; l public.listings; v_lead uuid; v_owner uuid;
BEGIN
 SELECT * INTO r FROM public.affiliate_referrals WHERE lower(tracking_code)=lower(_ref) LIMIT 1;
 SELECT * INTO l FROM public.listings WHERE id=r.listing_id;
 IF l.id IS NULL OR coalesce(_phone,'') !~ '^972[0-9]{8,9}$' THEN RETURN jsonb_build_object('ok',false); END IF;
 v_owner:=coalesce(l.workspace_owner_id,l.user_id);
 SELECT id INTO v_lead FROM public.leads WHERE workspace_owner_id=v_owner AND phone_number=_phone LIMIT 1;
 IF v_lead IS NULL THEN RETURN jsonb_build_object('ok',false,'error','contact_not_found'); END IF;
 UPDATE public.affiliate_referrals SET lead_id=coalesce(lead_id,v_lead),updated_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('ok',true,'lead_id',v_lead,'workspace_owner_id',v_owner,'pending_screening',true);
END; $$;
REVOKE ALL ON FUNCTION public.attribute_whatsapp_referral(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_whatsapp_referral(text,text,text) TO service_role;